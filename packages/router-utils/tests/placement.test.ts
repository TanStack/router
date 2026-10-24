import { describe, expect, it } from 'vitest'
import {
  MemoryHost,
  dedent,
  envInfo,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'

async function split(
  code: string,
  opts: { keys?: Array<string>; env?: 'client' | 'server' } = {},
) {
  const host = new MemoryHost({ files: { '/app/route.tsx': code } })
  const planners = [toyEnvPlanner(), toySplitPlanner({ keys: opts.keys })]
  const env = envInfo(
    opts.env === 'server'
      ? { name: 'ssr', type: 'server', routerSplit: false }
      : {},
  )
  const main = await host.compile('/app/route.tsx', planners, { env })
  const chunks: Record<string, string> = {}
  for (const key of opts.keys ?? ['component']) {
    const c = await host.compile(`/app/route.tsx?tsr-split=${key}`, planners, {
      env,
    })
    chunks[key] = c?.code ?? ''
  }
  return { host, env: main?.code ?? '', chunks, main }
}

const ROUTE = (opts: string, rest = '') =>
  dedent(`
    import { createFileRoute } from 'toy-router'
    import { wrapServer } from 'toy-start'
    ${rest}
    export const Route = createFileRoute('/')({
    ${opts}
    })
  `)

describe('clusters and the single-writer rule (A1)', () => {
  it('lets the sole writing group own a module binding it writes', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let next = 0
      export const Route = createFileRoute('/')({
        component: () => { next++; return next },
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('let next')
    expect(r.chunks.component).toContain('let next = 0')
    expect(r.chunks.component).toContain('next++')
  })

  it('falls back when the route module also needs a binding the component writes (shared-writer)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let count = 0
      export const Route = createFileRoute('/')({
        loader: () => count,
        component: () => { count++; return count },
      })
    `)
    const r = await split(code)
    expect(r.main?.facts.planners['toy-split']).toEqual({
      notSplittable: 'component',
    })
    expect(r.env).toContain('component: () => { count++; return count }')
    expect(r.chunks.component).toBe('export {}\n')
  })
})

describe('provenance-based orphans (R6)', () => {
  it('keeps a pre-existing disconnected effectful cycle (A6)', async () => {
    const code = ROUTE(
      '  component: () => null,',
      'const b = register(() => b)',
    )
    const r = await split(code)
    expect(r.env).toContain('const b = register(() => b)')
  })

  it('removes declarations orphaned by an erased handler with their initialiser effects (J4.11)', async () => {
    const code = dedent(`
      import { wrapServer } from 'toy-start'
      import { loadSecret } from './secret.server'
      const secret = loadSecret()
      const unrelated = sideEffect()
      export const fn = wrapServer(() => secret)
    `)
    const client = await split(code, { env: 'client' })
    // the toy planner replaces the whole call, so its callee import is orphaned too
    expect(client.env).toBe(
      dedent(`
      const unrelated = sideEffect()
      export const fn = tsrStub()
    `),
    )
    const server = await split(code, { env: 'server' })
    expect(server.env).toBe(
      dedent(`
      import { loadSecret } from './secret.server'
      const secret = loadSecret()
      const unrelated = sideEffect()
      export const fn = tsrRpc(() => secret)
    `),
    )
  })

  it('keeps an import still referenced by an export specifier (S5)', async () => {
    const code = dedent(`
      import { wrapServer } from 'toy-start'
      import { helper } from './helper'
      export const fn = wrapServer(() => helper())
      export { helper }
    `)
    const r = await split(code, { env: 'client' })
    expect(r.env).toContain("import { helper } from './helper'")
    expect(r.env).toContain('export { helper }')
  })
})

describe('ordered evaluation and movable effects (R7, R29, R31)', () => {
  it('co-locates an eager reader between two augmentations with the route module (A7)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { init, a, b } from './store'
      const plugins = []
      plugins.push(a)
      const store = init({ plugins: [...plugins] })
      plugins.push(b)
      export const Route = createFileRoute('/')({
        component: () => store.read(),
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('const store = init({ plugins: [...plugins] })')
    expect(r.env).toContain('export { store }')
    expect(r.chunks.component).toContain("import { store } from './route.tsx'")
    expect(r.chunks.component).not.toContain('init(')
  })

  it('moves an effectful initialiser followed only by the route factory chain (R29)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore } from './store'
      const store = createStore()
      export const Route = createFileRoute('/')({
        component: () => store.read(),
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('createStore')
    expect(r.chunks.component).toContain(
      "import { createStore } from './store'",
    )
    expect(r.chunks.component).toContain('const store = createStore()')
  })

  it('keeps the initialiser eager when a surviving effect follows it (N3 counterexample, R31 (d))', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { snapshot, advance } from './clock'
      const initial = snapshot()
      advance()
      export const Route = createFileRoute('/')({
        component: () => initial,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('const initial = snapshot()')
    expect(r.env).toContain('advance()')
    expect(r.env).toContain('export { initial }')
    expect(r.chunks.component).toContain(
      "import { initial } from './route.tsx'",
    )
  })

  it('a /* @__PURE__ */ initialiser simply moves', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const thing = /* @__PURE__ */ make()
      log()
      export const Route = createFileRoute('/')({
        component: () => thing,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('make()')
    expect(r.chunks.component).toContain('const thing = /* @__PURE__ */ make()')
  })
})

describe('needers and homes (§3.5.2)', () => {
  it('duplicates imports and copyable primitives, shares pure clusters, imports exported ones', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { fmt } from './fmt'
      const LIMIT = 10
      function shape(x) { return fmt(x) }
      export function exported() { return 1 }
      export const Route = createFileRoute('/')({
        component: () => shape(LIMIT) + exported(),
        errorComponent: () => shape(1) + fmt(2),
        loader: () => fmt(LIMIT),
      })
    `)
    const r = await split(code, { keys: ['component', 'errorComponent'] })
    expect(r.env).toContain("import { fmt } from './fmt'")
    expect(r.env).toContain('const LIMIT = 10')
    expect(r.env).not.toContain('function shape')
    expect(r.chunks.component).toContain('const LIMIT = 10')
    expect(r.chunks.component).toContain(
      "import { exported } from './route.tsx'",
    )
    expect(r.chunks.component).toContain(
      "import { shape } from './route.tsx?tsr-split=shared~component+errorComponent'",
    )
    expect(r.chunks.errorComponent).toContain("import { fmt } from './fmt'")
    expect(r.chunks.errorComponent).toContain(
      "import { shape } from './route.tsx?tsr-split=shared~component+errorComponent'",
    )
    const shared = await r.host.compile(
      '/app/route.tsx?tsr-split=shared~component+errorComponent',
      [
        toyEnvPlanner(),
        toySplitPlanner({ keys: ['component', 'errorComponent'] }),
      ],
    )
    expect(shared?.code).toBe(
      dedent(`
      import { fmt } from './fmt'
      function shape(x) { return fmt(x) }
      export { shape }
    `),
    )
  })

  it('allocates collision-free names from the file universe (D10)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const TsrSplitComponent = 1
      function tsrImportComponent() {}
      export const Route = createFileRoute('/')({
        component: () => TsrSplitComponent + tsrImportComponent(),
      })
    `)
    const r = await split(code)
    expect(r.env).toContain(
      "const tsrImportComponent$1 = () => import('./route.tsx?tsr-split=component')",
    )
    expect(r.env).toContain(
      "lazyRouteComponent(tsrImportComponent$1, 'component')",
    )
    expect(r.chunks.component).toContain(
      'const TsrSplitComponent$1 = () => TsrSplitComponent + tsrImportComponent()',
    )
    expect(r.chunks.component).toContain(
      'export { TsrSplitComponent$1 as component }',
    )
  })

  it('drops a type-only-used value import in route modules and keeps it elsewhere (J2.5, §9.1)', async () => {
    const route = dedent(`
      import { createFileRoute } from 'toy-router'
      import { Thing } from './thing'
      export const Route = createFileRoute('/')({
        component: () => null as unknown as Thing,
      })
    `)
    const r = await split(route)
    expect(r.env).not.toContain("'./thing'")
    const host = new MemoryHost({
      files: {
        '/app/lib.ts': dedent(`
          import { wrapServer } from 'toy-start'
          import { Thing } from './thing'
          export const fn = wrapServer(() => 1 as unknown as Thing)
        `),
      },
    })
    const out = await host.compile('/app/lib.ts', [toyEnvPlanner()])
    expect(out?.code).toContain("import { Thing } from './thing'")
    expect(out?.edges.map((e) => [e.specifier, e.kind])).toContainEqual([
      './thing',
      'evaluation',
    ])
  })

  it('keeps type units in the env module and out of derived outputs', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import type { T } from './t'
      type Local = T
      interface I { a: Local }
      export const Route = createFileRoute('/')({
        component: () => null as I | null,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("import type { T } from './t'")
    expect(r.env).toContain('type Local = T')
    expect(r.chunks.component).not.toContain('type Local')
    expect(r.chunks.component).not.toContain('./t')
  })
})
