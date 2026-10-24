import { describe, expect, it } from 'vitest'
import {
  MemoryHost,
  dedent,
  envInfo,
  findRouteOptions,
  propertyOf,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'
import type { Planner } from '../src/compiler'

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

describe('copyable clusters (impl-notes #6, lane router)', () => {
  it('duplicates an import specifier only where an included cluster reads it, not through an env-homed cluster', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { fetchPosts } from './api'
      function Posts() {
        return Route.useLoaderData().length
      }
      export const Route = createFileRoute('/posts')({
        loader: () => fetchPosts(),
        component: Posts,
      })
    `)
    const r = await split(code)
    expect(r.chunks.component).toContain('function Posts()')
    expect(r.chunks.component).toContain("import { Route } from './route.tsx'")
    expect(r.chunks.component).not.toContain('fetchPosts')
    expect(r.chunks.component).not.toContain('createFileRoute')
    expect(r.env).toContain("import { fetchPosts } from './api'")
  })
})

describe('glue and renames (lane router)', () => {
  it('names a renamed binding in the export and import glue', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const page = () => 'x'
      export const Route = createFileRoute('/')({
        component: page,
        pendingComponent: page,
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const rename: Planner = {
      name: 'toy-rename',
      tier: 1,
      gate: () => true,
      prepare(ctx) {
        const sym = ctx.analysis.exports.length
          ? ctx.t1.units.find(
              (u) =>
                u.kind === 'declaration' &&
                ctx.symbols.name(u.declares[0]!) === 'page',
            )!.declares[0]!
          : null
        if (sym !== null) {
          const next = ctx.names.alloc('TsrPendingComponent')
          ctx.renameRefs(sym, { sym: next.sym }, 'all-outputs', 'toy-rename')
        }
      },
      plan() {},
    }
    const planners = [toySplitPlanner(), rename]
    const main = await host.compile('/app/route.tsx', planners)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
    )
    expect(main?.code).toContain('const TsrPendingComponent = ')
    expect(main?.code).not.toContain('page')
    expect(main?.code).toContain('export { TsrPendingComponent }')
    expect(chunk?.code).toContain(
      "import { TsrPendingComponent } from './route.tsx'",
    )
    expect(chunk?.code).not.toContain('page')
  })

  it('renames an exported overloaded function with one export specifier', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function page(): string
      export function page() { return 'x' }
      export const Route = createFileRoute('/')({ pendingComponent: page })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const rename: Planner = {
      name: 'toy-rename',
      tier: 1,
      gate: () => true,
      prepare(ctx) {
        const unit = ctx.t1.units.find(
          (u) =>
            u.kind === 'declaration' &&
            ctx.symbols.name(u.declares[0]!) === 'page',
        )!
        const next = ctx.names.alloc('TsrPendingComponent')
        ctx.renameRefs(
          unit.declares[0]!,
          { sym: next.sym },
          'all-outputs',
          'toy-rename',
        )
      },
      plan() {},
    }
    const main = await host.compile('/app/route.tsx', [
      toySplitPlanner(),
      rename,
    ])
    expect(main?.code).toContain('function TsrPendingComponent(): string')
    expect(main?.code).toContain(
      "function TsrPendingComponent() { return 'x' }",
    )
    expect(main?.code.match(/as page/g)?.length).toBe(1)
  })

  it('renames a destructured binding by keeping its pattern key', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const { read, render = fallback } = makeHelpers()
      export const Route = createFileRoute('/')({
        loader: () => read(),
        component: () => render(),
        pendingComponent: render,
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const rename: Planner = {
      name: 'toy-rename',
      tier: 1,
      gate: () => true,
      prepare(ctx) {
        const unit = ctx.t1.units.find(
          (u) =>
            u.kind === 'declaration' &&
            u.declares.some((d) => ctx.symbols.name(d) === 'render'),
        )!
        const sym = unit.declares.find((d) => ctx.symbols.name(d) === 'render')!
        const next = ctx.names.alloc('TsrPendingComponent')
        ctx.renameRefs(sym, { sym: next.sym }, 'all-outputs', 'toy-rename')
      },
      plan() {},
    }
    const planners = [toySplitPlanner(), rename]
    const main = await host.compile('/app/route.tsx', planners)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
    )
    expect(main?.code).toContain(
      'const { read, render: TsrPendingComponent = fallback } = makeHelpers()',
    )
    expect(main?.code).toContain('pendingComponent: TsrPendingComponent')
    expect(chunk?.code).toContain(
      "import { TsrPendingComponent } from './route.tsx'",
    )
    expect(chunk?.code).toContain('() => TsrPendingComponent()')
  })

  it('keeps a declaration orphaned in the env module when a chunk needs it', async () => {
    // the component option names `Page`; a planner erases that occurrence in
    // the env output and roots the chunk on a unit reading `Page`
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function Page() { return 'page' }
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const erase: Planner = {
      name: 'toy-erase',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const found = findRouteOptions(ctx)!
        const p = propertyOf(found.options, 'component')!
        ctx.setRouteModule()
        const out = ctx.declareOutput({
          kind: 'split',
          key: 'component',
          derived: { kind: 'split', value: 'component' },
        })
        const sym = ctx.analysis.file.referenceOf(p.value)!.binding!.id as never
        const split = ctx.names.alloc('TsrSplitComponent')
        ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${split.name} = `, { sym }, '\n'] },
            { k: 'text', parts: [`export { ${split.name} as component }\n`] },
          ],
          declares: [split.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-erase',
        })
        ctx.rewrites.add({
          range: { start: p.value.start, end: p.value.end },
          body: [{ k: 'text', parts: ['null'] }],
          scope: ['env'],
          by: 'toy-erase',
        })
      },
    }
    const main = await host.compile('/app/route.tsx', [erase])
    const chunk = await host.compile('/app/route.tsx?tsr-split=component', [
      erase,
    ])
    expect(main?.code).toContain('component: null')
    expect(main?.code).not.toContain('function Page()')
    expect(chunk?.code).toContain('function Page()')
    expect(chunk?.code).toContain('const TsrSplitComponent = Page')
  })

  it('starts end glue on its own line when the source has no trailing newline', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const Route = createFileRoute('/')({
        component: () => 'x',
      })`).replace(/\n$/, '')
    const r = await split(code)
    expect(r.env.endsWith('})\n')).toBe(true)
  })

  it('keeps a license comment above a moved component in the env module only (G12)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      /** @license Example Corp. | MIT License */
      function Page() {
        return 'page'
      }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.env).toContain('/** @license Example Corp. | MIT License */')
    expect(r.env).not.toContain('function Page()')
    expect(r.chunks.component).toContain('function Page()')
    expect(r.chunks.component).not.toContain('@license')
  })
})

describe('extracted-export outputs (§3.5.3)', () => {
  async function extract(code: string, keys = ['component']) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ keys, extractExports: true })]
    const env = (await host.compile('/app/route.tsx', planners))?.code ?? ''
    const chunk =
      (await host.compile('/app/route.tsx?tsr-split=component', planners))
        ?.code ?? ''
    const extracted = async (name: string) =>
      await host.compile(`/app/route.tsx?tsr-split=export~${name}`, planners)
    return { env, chunk, extracted }
  }

  it('moves an exported pure declaration only a chunk needs and re-exports it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { heavy } from './heavy'
      export function Card() { return heavy() }
      function Page() { return Card() }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('function Card')
    expect(r.env).not.toContain("from './heavy'")
    expect(r.env).toContain(
      "export { Card } from './route.tsx?tsr-split=export~Card'",
    )
    expect(r.chunk).toContain(
      "import { Card } from './route.tsx?tsr-split=export~Card'",
    )
    const e = await r.extracted('Card')
    expect(e?.code).toContain("import { heavy } from './heavy'")
    expect(e?.code).toContain('function Card() { return heavy() }')
    expect(e?.code).not.toContain('export function Card')
    expect(e?.code).toContain('export { Card }')
    expect(e?.sideEffectFree).toBe(true)
  })

  it('keeps an exported declaration the env module reads, and an unread one', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Card() { return 'card' }
      export function helper() { return 'helper' }
      export function Page() { return Card() }
      export const Route = createFileRoute('/')({
        loader: () => Card(),
        component: Page,
      })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export function Card()')
    expect(r.env).toContain('export function helper()')
    expect(r.env).not.toContain('export function Page()')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    expect(r.chunk).toContain(
      "import { Page } from './route.tsx?tsr-split=export~Page'",
    )
    expect(r.chunk).toContain('const TsrSplitComponent = Page')
    expect(r.chunk).not.toContain('helper')
    const page = await r.extracted('Page')
    expect(page?.code).toContain("import { Card } from './route.tsx'")
    expect(page?.code).toContain('function Page() { return Card() }')
  })

  it('re-exports under every public name and drops the export companions', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function Card() { return 'card' }
      export { Card as View }
      export default Card
      function Page() { return Card() }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('function Card')
    expect(r.env).not.toContain('export { Card as View }')
    expect(r.env).not.toContain('export default Card')
    expect(r.env).toContain(
      "export { Card as View, Card as default } from './route.tsx?tsr-split=export~Card'",
    )
  })

  it('does not extract a declaration that eagerly reads the env module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const id = Route.id
      function Page() { return id }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export const id = Route.id')
    expect(r.chunk).toContain("import { id } from './route.tsx'")
  })
})

describe('route-module specifics (lane router)', () => {
  it('drops inline type specifiers of a route module from the env output (J2.5)', async () => {
    // `import { type Db }` survives verbatimModuleSyntax as `import './db'`;
    // `import type` is erased by TypeScript and may stay
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { type Db } from './db'
      import type { Other } from './other'
      function Page(props: { db?: Db; other?: Other }) { return 'page' }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.env).not.toContain("'./db'")
    expect(r.env).toContain("import type { Other } from './other'")
    expect(r.chunks.component).not.toContain("'./db'")
    expect(r.chunks.component).not.toContain("'./other'")
  })

  it('moves an effectful declaration an identifier option value named into the chunk that needs it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { sharedLib } from 'shared-lib'
      const util = () => sharedLib()
      const Page = (() => { const m = util(); return () => m })()
      export const Route = createFileRoute('/')({ loader: () => util(), component: Page })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const erase: Planner = {
      name: 'toy-erase',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const found = findRouteOptions(ctx)!
        const p = propertyOf(found.options, 'component')!
        ctx.setRouteModule()
        ctx.markBenignEffect(found.unit.id)
        const out = ctx.declareOutput({
          kind: 'split',
          key: 'component',
          derived: { kind: 'split', value: 'component' },
        })
        const sym = ctx.analysis.file.referenceOf(p.value)!.binding!.id as never
        const split = ctx.names.alloc('TsrSplitComponent')
        ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${split.name} = `, { sym }, '\n'] },
            { k: 'text', parts: [`export { ${split.name} as component }\n`] },
          ],
          declares: [split.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-erase',
        })
        ctx.rewrites.add({
          range: { start: p.value.start, end: p.value.end },
          body: [{ k: 'text', parts: ['null'] }],
          scope: ['env'],
          by: 'toy-erase',
        })
      },
    }
    const main = await host.compile('/app/route.tsx', [erase])
    const chunk = await host.compile('/app/route.tsx?tsr-split=component', [
      erase,
    ])
    expect(main?.code).not.toContain('const Page')
    expect(main?.code).toContain('const util')
    expect(main?.code).not.toContain('tsr-split=component')
    expect(chunk?.code).toContain('const Page = (() =>')
    expect(chunk?.code).toContain("import { util } from './route.tsx'")
  })

  it('drops an unreferenced pure function that would keep a chunk dependency in the env module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { heavy } from './heavy'
      export const Route = createFileRoute('/')({ component: Page })
      function Page() { return heavy() }
      function Unused() { return Page() }
    `)
    const r = await split(code)
    expect(r.env).not.toContain('heavy')
    expect(r.env).not.toContain('function Unused')
    expect(r.chunks.component).toContain("import { heavy } from './heavy'")
    expect(r.chunks.component).toContain('function Page()')
  })

  it('treats a var declared in a for head as a binding of that statement', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      for (var value = 0; value < 3; value++) {}
      export const Route = createFileRoute('/')({
        loader: () => value,
        component: () => value,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('for (var value = 0; value < 3; value++) {}')
    expect(r.env).toContain('export { value }')
    expect(r.chunks.component).toContain("import { value } from './route.tsx'")
  })

  it('prints an import assertion as an attribute wherever the import lands (J2.17)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import data from './data.json' assert { type: 'json' }
      export const Route = createFileRoute('/')({
        loader: () => 'data',
        component: () => data.title,
      })
    `)
    const r = await split(code)
    expect(r.chunks.component).toContain(
      "import data from './data.json' with { type: 'json' }",
    )
    expect(r.env).not.toContain('assert')
  })

  it('keeps a React binding JSX may compile to when the runtime is unknown', async () => {
    const code = dedent(`
      import * as React from 'react'
      import { createFileRoute } from 'toy-router'
      type Title = React.ReactNode
      export const Route = createFileRoute('/')({ component: () => <p>classic</p> })
    `)
    const r = await split(code)
    expect(r.chunks.component).toContain("import * as React from 'react'")
    expect(r.env).not.toContain("from 'react'")
  })

  it('copies ambient value declarations into derived outputs (erased by TypeScript, resolved by its transforms)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      declare enum Flags { On = 1 }
      interface Shape { a: string }
      export const Route = createFileRoute('/')({
        loader: () => Flags.On,
        component: () => Flags.On,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('declare enum Flags { On = 1 }')
    expect(r.chunks.component).toContain('declare enum Flags { On = 1 }')
    expect(r.chunks.component).not.toContain('interface Shape')
  })

  it('reads the function of a Solid use: directive from the JSX that names it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function tip(el: HTMLElement) { el.dataset.tip = 'on' }
      export const Route = createFileRoute('/')({ component: () => <p use:tip>tip</p> })
    `)
    const r = await split(code)
    expect(r.chunks.component).toContain('function tip(')
    expect(r.env).not.toContain('function tip(')
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
