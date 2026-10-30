import { describe, expect, it } from 'vitest'
import { EMPTY_RECOGNIZER } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  envInfo,
  findRouteOptions,
  propertyOf,
  toyEnvPlanner,
  toyHydratePlanner,
  toySplitPlanner,
} from './helpers'
import type { EnvInfo, Planner, SymbolId } from '../src/compiler'

async function split(
  code: string,
  opts: {
    keys?: Array<string>
    env?: 'client' | 'server'
    identifierEdits?: boolean
    files?: Record<string, string>
  } = {},
) {
  const host = new MemoryHost({
    files: { '/app/route.tsx': code, ...opts.files },
  })
  const planners = [
    toyEnvPlanner(),
    toySplitPlanner({ keys: opts.keys, identifierEdits: opts.identifierEdits }),
  ]
  const env = envInfo(
    opts.env === 'server' ? { name: 'ssr', type: 'server' } : {},
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

describe('clusters and the single-writer rule', () => {
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

  it.each([
    ['assigns', 'next = 1'],
    ['updates', '++next'],
  ])(
    'homes a module binding the sole group only %s in its chunk (writes need the binding)',
    async (_, write) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let next = 0
        export const Route = createFileRoute('/')({
          component: () => { ${write}; return null },
        })
      `)
      const r = await split(code)
      expect(r.main?.facts.planners['toy-split']).toBeUndefined()
      expect(r.env).not.toContain('let next')
      expect(r.chunks.component).toContain('let next = 0')
      expect(r.chunks.component).toContain(write)
    },
  )

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
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      notSplittable: 'component',
    })
    expect(r.env).toContain('component: () => { count++; return count }')
    expect(r.chunks.component).toBe('export {}\n')
  })
})

describe('copyable clusters', () => {
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
  it('does not duplicate a regex literal: its identity and lastIndex are state', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const re = /x/g
      export const Route = createFileRoute('/')({
        loader: () => re.lastIndex,
        component: () => re.test('x'),
        errorComponent: () => re.test('y'),
      })
    `)
    const r = await split(code, { keys: ['component', 'errorComponent'] })
    expect(r.env).toContain('const re = /x/g')
    expect(r.chunks.component).not.toContain('/x/g')
    expect(r.chunks.component).toContain("import { re } from './route.tsx'")
    expect(r.chunks.errorComponent).toContain(
      "import { re } from './route.tsx'",
    )
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
      plan(ctx) {
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
    }
    const planners = [rename, toySplitPlanner()]
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

  it('keeps the other declarators of a multi-declarator export exported when one is renamed', async () => {
    // `export const a = 1, page = …`: renaming `page` drops the statement's
    // `export` keyword (the glue re-exports the renamed binding under its
    // public name); `a` must stay exported too
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const a = 1, page = () => 'x'
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
      plan(ctx) {
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
    }
    const planners = [rename, toySplitPlanner()]
    const main = await host.compile('/app/route.tsx', planners)
    expect(main?.code).toContain('const a = 1, TsrPendingComponent = ')
    expect(main?.code).not.toMatch(/export const a\b/)
    const glue = [...(main?.code ?? '').matchAll(/export \{ ([^}]*) \}/g)]
      .flatMap((m) => m[1]!.split(',').map((p) => p.trim()))
      .sort()
    // the chunk's own import glue (`TsrPendingComponent`), the renamed binding's re-export, the sibling
    expect(glue).toEqual([
      'TsrPendingComponent',
      'TsrPendingComponent as page',
      'a',
    ])
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
      plan(ctx) {
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
    }
    const main = await host.compile('/app/route.tsx', [
      rename,
      toySplitPlanner(),
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
      plan(ctx) {
        const unit = ctx.t1.units.find(
          (u) =>
            u.kind === 'declaration' &&
            u.declares.some((d) => ctx.symbols.name(d) === 'render'),
        )!
        const sym = unit.declares.find((d) => ctx.symbols.name(d) === 'render')!
        const next = ctx.names.alloc('TsrPendingComponent')
        ctx.renameRefs(sym, { sym: next.sym }, 'all-outputs', 'toy-rename')
      },
    }
    const planners = [rename, toySplitPlanner()]
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
    // no end glue in the env output: it ends as the source does
    expect(r.env.endsWith('})')).toBe(true)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const glue: Planner = {
      name: 'toy-end-glue',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const sym = ctx.names.alloc('tsrEnd')
        ctx.rewrites.addGenerated({
          body: [{ k: 'text', parts: [`export const ${sym.name} = 1\n`] }],
          declares: [sym.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: 'env',
          by: 'toy-end-glue',
        })
        ctx.addRoot('env', { t: 'sym', id: sym.sym })
      },
    }
    const out = await host.compile('/app/route.tsx', [glue])
    expect(out!.code.endsWith('})\nexport const tsrEnd = 1\n')).toBe(true)
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

describe('extracted-export outputs', () => {
  // extracted-export outputs exist in a build; in dev the same clusters stay
  // in the env module (the last cases of this block)
  const build = { env: envInfo({ mode: 'build' }) }
  async function extract(
    code: string,
    keys = ['component'],
    extra: { env: EnvInfo } = build,
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ keys, extractExports: true })]
    const out = await host.compile('/app/route.tsx', planners, extra)
    const env = out?.code ?? ''
    const chunk =
      (
        await host.compile(
          '/app/route.tsx?tsr-split=component',
          planners,
          extra,
        )
      )?.code ?? ''
    const extracted = async (name: string) =>
      await host.compile(
        `/app/route.tsx?tsr-split=export~${name}`,
        planners,
        extra,
      )
    return { host, env, chunk, extracted, diagnostics: out?.diagnostics ?? [] }
  }

  // A pure, unassigned exported cluster leaves for its extracted module,
  // which serves other importers of the route file; the chunk copies it (and
  // the imports only they share) instead of importing that module, so the
  // module is imported by nobody unless another file imports the binding
  // and the bundler drops it.
  it('moves an exported pure declaration only a chunk needs and re-exports it; the chunk copies it', async () => {
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
    expect(r.chunk).not.toContain('export~Card')
    expect(r.chunk).toContain("import { heavy } from './heavy'")
    expect(r.chunk).toContain('function Card() { return heavy() }')
    expect(r.diagnostics).toEqual([])
    const e = await r.extracted('Card')
    expect(e?.code).toContain("import { heavy } from './heavy'")
    expect(e?.code).toContain('function Card() { return heavy() }')
    expect(e?.code).not.toContain('export function Card')
    expect(e?.code).toContain('export { Card }')
    expect(e?.sideEffectFree).toBe(true)
  })

  // The env module re-exports the extracted module (`export { Page } from
  // …`), a static dependency: it evaluates before the env module's body.
  it('keeps a declaration the extracted module would read eagerly from what the env module keeps (no TDZ)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      class Model { static label = 'model' }
      export const label = Model.label
      const config = { model: Model }
      export function Page() { return config.model.label }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('const config = { model: Model }')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).not.toContain('const config')
    expect(e?.code).toContain("import { config } from './route.tsx'")
    expect(e?.code).toContain('function Page() { return config.model.label }')
  })

  it('extracts an exported declaration that reads a copyable constant the route module keeps (the extracted module gets its own copy)', async () => {
    // `SIZE` is duplicated into every output that reads it: the extracted
    // module reads its own copy, not the route module's (no cycle, no TDZ)
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const SIZE = 3
      export const Page = { size: SIZE, render: () => SIZE }
      export const Route = createFileRoute('/')({
        loader: () => SIZE,
        component: Page,
      })
    `)
    const r = await extract(code)
    expect(r.env).toContain('const SIZE = 3')
    expect(r.env).toContain('loader: () => SIZE')
    expect(r.env).not.toContain('size: SIZE')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain('const SIZE = 3')
    expect(e?.code).toContain('const Page = { size: SIZE, render: () => SIZE }')
    expect(e?.code).toContain('export { Page }')
    expect(e?.code).not.toContain("from './route.tsx'")
  })

  it('keeps an effectful declaration only an extracted export needs in the env module (it would run before its effects)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { mark } from './mark'
      mark('route')
      const first = mark('page')
      export function Page() { return first }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("mark('route')")
    expect(r.env).toContain("const first = mark('page')")
    const e = await r.extracted('Page')
    expect(e?.code).not.toContain("mark('page')")
    expect(e?.code).toContain("import { first } from './route.tsx'")
  })

  it('re-exports every exported symbol of an extracted cluster (a let and the function writing it)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export let theme = 'light'
      export const setTheme = (t) => { theme = t }
      function Page() { return theme }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { theme, setTheme } from './route.tsx?tsr-split=export~setTheme'",
    )
    expect(r.env).not.toContain('let theme')
    expect(r.env).not.toContain('const setTheme')
    const e = await r.extracted('setTheme')
    expect(e?.code).toContain("let theme = 'light'")
    expect(e?.code).toContain('const setTheme = (t) => { theme = t }')
    expect(e?.code).toContain('export { theme, setTheme }')
    expect(r.chunk).toContain(
      "import { theme } from './route.tsx?tsr-split=export~setTheme'",
    )
  })

  // The mutation model is read through the env output's liveness. A
  // Start route file whose only write of an exported `let` is inside a
  // server fn handler: on the client the handler is a stub, so nothing
  // writes the binding there; it is extractable, the chunk copies it and
  // the build does not say it is reassigned.
  it('counts no write inside code the environment erases: the export leaves and nothing is reported', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      export let hits = 0
      export const bump = wrapServer(() => { hits++ })
      function Page() { return hits }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toyEnvPlanner(),
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const out = await host.compile('/app/route.tsx', planners, build)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      build,
    )
    expect(out!.code).toContain(
      "export { hits } from './route.tsx?tsr-split=export~hits'",
    )
    expect(out!.code).toContain('export const bump = tsrStub()')
    expect(chunk!.code).toContain('let hits = 0')
    expect(
      out!.diagnostics.filter((d) => d.code?.startsWith('eager-')),
    ).toEqual([])
    // the server keeps the write: the export stays, reported once
    const server = await host.compile('/app/route.tsx', planners, {
      env: envInfo({
        name: 'ssr',
        type: 'server',
        mode: 'build',
      }),
    })
    expect(server!.code).toContain('export let hits = 0')
    expect(
      server!.diagnostics.map((d) => [d.code, d.range?.start]),
    ).toContainEqual([
      expect.stringMatching(/^eager-export:/),
      code.indexOf('hits = 0'),
    ])
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
    // the chunk copies `Page` and imports `Card` from the route module
    expect(r.chunk).not.toContain('export~Page')
    expect(r.chunk).toContain("import { Card } from './route.tsx'")
    expect(r.chunk).toContain('function Page() { return Card() }')
    expect(r.chunk).toContain('const TsrSplitComponent = Page')
    expect(r.chunk).not.toContain('helper')
    // `Card` stays in the route module because the loader reads it
    expect(r.diagnostics).toMatchObject([
      {
        code: 'eager-export:live',
        range: { start: code.indexOf('export function Card') },
      },
    ])
    const page = await r.extracted('Page')
    expect(page?.code).toContain("import { Card } from './route.tsx'")
    expect(page?.code).toContain('function Page() { return Card() }')
  })

  it('an export the env module keeps is no output of the plan (a stale request gets an empty module)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Card() { return 'card' }
      export function Page() { return Card() }
      export const Route = createFileRoute('/')({
        loader: () => Card(),
        component: Page,
      })
    `)
    const r = await extract(code)
    const outputs = r.host.caches.plans.get(envInfo().name)!
    const [key] = outputs.keysAt('/app/route.tsx')
    expect(Object.keys(outputs.get(key!)!.plan.outputs).sort()).toEqual([
      'derived:/app/route.tsx?tsr-split=component',
      'derived:/app/route.tsx?tsr-split=export~Page',
      'env',
    ])
    expect((await r.extracted('Card'))?.code).toBe('export {}\n')
  })

  it('renders a homeId ref as the id of the module the chunk takes the binding from', async () => {
    const homeOf = async (code: string) => {
      const files = { '/app/route.tsx': dedent(code) }
      const planners = [
        toySplitPlanner({
          extractExports: true,
          identifierEdits: true,
          homeIds: true,
        }),
      ]
      const chunk = await new MemoryHost({ files }).compile(
        '/app/route.tsx?tsr-split=component',
        planners,
      )
      return /export const home = (".*")/.exec(chunk?.code ?? '')?.[1]
    }
    const route = (page: string, loader = '') => `
      import { createFileRoute } from 'toy-router'
      ${page}
      export const Route = createFileRoute('/')({${loader}
        component: Page,
      })
    `
    // in the chunk, copied into the chunk (extracted for importers), kept
    // in the route module (its loader reads it)
    expect(await homeOf(route('function Page() { return 1 }'))).toBe(
      '"/app/route.tsx?tsr-split=component"',
    )
    expect(await homeOf(route('export function Page() { return 1 }'))).toBe(
      '"/app/route.tsx?tsr-split=component"',
    )
    expect(
      await homeOf(
        route('export function Page() { return 1 }', ' loader: () => Page,'),
      ),
    ).toBe('"/app/route.tsx"')
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

  it('re-exports a string export name as a string literal', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function Card() { return 'card' }
      export { Card as 'card-view' }
      function Page() { return Card() }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { Card as 'card-view' } from './route.tsx?tsr-split=export~Card'",
    )
  })

  it('keeps a default export of an expression reading a candidate in the env module (it is no re-export)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Page() { return 'page' }
      export default () => Page()
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export default () => Page()')
    expect(r.env).toContain('export function Page()')
    expect(r.env).not.toContain('export~')
  })

  it('moves an exported function with the module state it writes, when only the chunk reads it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let clicks = 0
      export function bump() { clicks++ }
      function Page() { return clicks }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('let clicks')
    expect(r.env).toContain(
      "export { bump } from './route.tsx?tsr-split=export~bump'",
    )
    expect(r.chunk).toContain(
      "import { clicks } from './route.tsx?tsr-split=export~bump'",
    )
    const e = await r.extracted('bump')
    expect(e?.code).toContain('let clicks = 0')
    expect(e?.code).toContain('function bump() { clicks++ }')
  })

  it('keeps a cluster a split region writes in the env module (the single-writer rule, not an extraction)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let clicks = 0
      export function bump() { clicks++ }
      export const Route = createFileRoute('/')({ component: () => { clicks++; return clicks } })
    `)
    const r = await extract(code)
    expect(r.env).toContain('let clicks = 0')
    expect(r.env).toContain('export function bump()')
    expect(r.env).toContain('clicks++; return clicks')
    expect(r.chunk).toBe('export {}\n')
    expect(await r.extracted('bump')).toMatchObject({ code: 'export {}\n' })
  })

  it('keeps an import a cancelled extraction candidate reads when an erased range read it too', async () => {
    // `Page` is a candidate nothing extracted needs, so it stays an env root;
    // the client erases the `wrapServer` argument, the only other reader of
    // `fmt`. Orphans are decided on the final env liveness, not before the
    // candidate came back (a `<Hydrate>` after erased server code lost its
    // import this way).
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { fmt } from './fmt'
      export const serverFn = wrapServer(() => fmt('s'))
      export function Page() { return fmt('p') }
      export const Route = createFileRoute('/')({ component: () => 1 })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toyEnvPlanner(),
      toySplitPlanner({ extractExports: true }),
    ]
    const env = (await host.compile('/app/route.tsx', planners))?.code ?? ''
    expect(env).toContain("import { fmt } from './fmt'")
    expect(env).toContain('export const serverFn = tsrStub()')
    expect(env).toContain("export function Page() { return fmt('p') }")
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

  // The env module re-exports an extracted declaration, so one reading
  // eagerly what the env module keeps would evaluate before it (a cycle).
  // What the env module keeps is known once every candidate and every move
  // is decided: a candidate kept for another reason, and an effectful
  // declaration a chunk needs that cannot move, make what they read stay.
  it('does not extract a declaration reading what another kept candidate reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const Shared = () => 'shared'
      export const Page = Shared
      export const Alias = Shared
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("const Shared = () => 'shared'")
    expect(r.env).toContain('export const Page = Shared')
    expect(r.env).toContain('export const Alias = Shared')
    expect(r.env).not.toContain('export~')
  })

  it('does not extract a declaration reading what an effectful declaration a chunk needs reads', async () => {
    // `store` is only read by the chunk and by code the env planner erases;
    // the effect after it keeps it in the env module, with `Shared`
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { see } from './see'
      const Shared = () => 'shared'
      const store = see(Shared)
      see('after')
      export const Page = Shared
      export const serverFn = wrapServer(() => store)
      export const Route = createFileRoute('/')({
        component: () => [Page(), store],
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toyEnvPlanner(),
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = (await host.compile('/app/route.tsx', planners))?.code ?? ''
    expect(env).toContain('const store = see(Shared)')
    expect(env).toContain('export const Page = Shared')
    expect(env).not.toContain('export~')
  })

  it('keeps an effectful declaration only an extracted export and its copies read in the env module (one instance)', async () => {
    // both chunks copy `Card`, so `theme` has three needers and cannot move
    // (it has several needers): it stays in the route module, where the copies and the
    // extracted module import it from (the one cost of copying over
    // importing the extracted module)
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createTheme } from './theme'
      const theme = createTheme()
      export function Card() { return theme.card }
      export const Route = createFileRoute('/')({
        component: () => Card(),
        errorComponent: () => Card(),
      })
    `)
    const r = await extract(code, ['component', 'errorComponent'])
    expect(r.env).toContain('const theme = createTheme()')
    expect(r.env).toContain('export { theme }')
    expect(r.env).toContain(
      "export { Card } from './route.tsx?tsr-split=export~Card'",
    )
    expect(r.chunk).toContain("import { theme } from './route.tsx'")
    expect(r.chunk).toContain('function Card() { return theme.card }')
    const e = await r.extracted('Card')
    expect(e?.code).toContain("import { theme } from './route.tsx'")
    expect(e?.code).toContain('function Card() { return theme.card }')
    expect(e?.sideEffectFree).toBe(true)
  })

  it('copies a pure helper an extracted module and a chunk both read into each (no shared module)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const label = (v: string) => v + '!'
      export function Card() { return label('card') }
      export const Route = createFileRoute('/')({
        component: () => Card(),
        errorComponent: () => label('error'),
      })
    `)
    const r = await extract(code, ['component', 'errorComponent'])
    expect(r.env).not.toContain('const label')
    expect(r.env).not.toContain('tsr-split=shared')
    expect(r.chunk).toContain("const label = (v: string) => v + '!'")
    expect(r.chunk).not.toContain('tsr-split=shared')
    const error =
      (
        await r.host.compile(
          '/app/route.tsx?tsr-split=errorComponent',
          [
            toySplitPlanner({
              keys: ['component', 'errorComponent'],
              extractExports: true,
            }),
          ],
          build,
        )
      )?.code ?? ''
    expect(error).toContain("const label = (v: string) => v + '!'")
    expect((await r.extracted('Card'))?.code).toContain(
      "const label = (v: string) => v + '!'",
    )
  })

  it('imports a cluster declaring state or observing it from the extracted module instead of copying it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 0
      export function inc() { n++ }
      export const initial = [n]
      function Page() { inc(); return initial }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.chunk).toContain(
      "import { inc } from './route.tsx?tsr-split=export~inc'",
    )
    expect(r.chunk).toContain(
      "import { initial } from './route.tsx?tsr-split=export~initial'",
    )
    expect(r.chunk).not.toContain('n++')
    expect(r.diagnostics).toEqual([])
  })

  // J2.8: an exported declaration a chunk needs that stays in the route
  // module is reported once per export with the reason, positioned at the
  // declaration; a route file exporting only `Route` reports nothing
  it('reports an exported declaration a chunk needs that stays in the route module, with the reason', async () => {
    const effects = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore } from './store'
      export const store = createStore()
      function Page() { return store.value }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    let r = await extract(effects)
    expect(r.env).toContain('export const store = createStore()')
    expect(r.chunk).toContain("import { store } from './route.tsx'")
    expect(r.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: 'eager-export:effects',
        by: 'core',
        range: { start: effects.indexOf('store = createStore') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain('`store`')
    expect(r.diagnostics[0]!.message).toContain('/app/route.tsx')

    // (an exported writer would leave with its state: "moves an exported
    // function with the module state it writes"; an unexported one keeps
    // the cluster in the route module, and the chunk imports it)
    const reassigned = dedent(`
      import { createFileRoute } from 'toy-router'
      export let count = 0
      function bump() { count++ }
      function Page() { bump(); return count }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    r = await extract(reassigned)
    expect(r.chunk).toContain("import { count, bump } from './route.tsx'")
    expect(r.diagnostics).toMatchObject([
      {
        code: 'eager-export:reassigned',
        range: { start: reassigned.indexOf('count = 0') },
      },
    ])

    const onlyRoute = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore } from './store'
      const store = createStore()
      function Page() { return store.value }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    r = await extract(onlyRoute)
    expect(r.diagnostics).toEqual([])

    const unread = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore } from './store'
      export const store = createStore()
      function Page() { return 'page' }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    r = await extract(unread)
    expect(r.diagnostics).toEqual([])
  })

  // In dev the same clusters leave nothing: an extracted cluster
  // stays in the env module as written, its companions with it, and the
  // chunk copies or imports it exactly as in a build
  describe('in dev', () => {
    const dev = { env: envInfo({ mode: 'dev' }) }

    it('keeps a pure exported declaration in the route module and copies it into the chunk', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { heavy } from './heavy'
        export function Card() { return heavy() }
        export { Card as View }
        function Page() { return Card() }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.env).toContain("import { heavy } from './heavy'")
      expect(r.env).toContain('export function Card() { return heavy() }')
      expect(r.env).toContain('export { Card as View }')
      expect(r.env).not.toContain('export~')
      expect(r.chunk).toContain("import { heavy } from './heavy'")
      expect(r.chunk).toContain('function Card() { return heavy() }')
      expect(r.chunk).not.toContain("from './route.tsx")
      expect((await r.extracted('Card'))?.code).toBe('export {}\n')
      expect(r.diagnostics).toEqual([])
    })

    it('keeps an exported declaration with state in the route module, imported by the chunk', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let clicks = 0
        export function bump() { clicks++ }
        function Page() { return clicks }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.env).toContain('let clicks = 0')
      expect(r.env).toContain('export function bump() { clicks++ }')
      expect(r.env).toContain('export { clicks }')
      expect(r.chunk).toContain("import { clicks } from './route.tsx'")
      expect(r.chunk).not.toContain('clicks++')
    })

    it('imports a binding the route module exports under a string name with a string literal', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let clicks = 0
        export function bump() { clicks++ }
        export { clicks as 'click-count' }
        function Page() { return clicks }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.chunk).toContain(
        "import { 'click-count' as clicks } from './route.tsx'",
      )
    })

    it('keeps what only an extracted export reads in the route module', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { createTheme } from './theme'
        const theme = createTheme()
        export function Card() { return theme.card }
        export const Route = createFileRoute('/')({ component: () => Card() })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.env).toContain('const theme = createTheme()')
      expect(r.env).toContain('export function Card() { return theme.card }')
      expect(r.chunk).toContain("import { theme } from './route.tsx'")
      expect(r.chunk).toContain('function Card() { return theme.card }')
    })

    it('reports a kept export as in a build', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { createStore } from './store'
        export const store = createStore()
        function Page() { return store.value }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.diagnostics).toMatchObject([{ code: 'eager-export:effects' }])
    })
  })

  // An exported binding's augmentations (`Page.displayName = …`, static
  // props) and an effectful initialiser leave with it under the order rule
  // of every move: the extracted module evaluates before the env module's
  // body, so a surviving effect before the cluster's last one pins it, and
  // one after keeps its order.
  it('extracts an exported component with its augmentations', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Page() { return Page.displayName }
      Page.displayName = 'PageDisplay'
      Page.preload = () => import('./heavy')
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('displayName')
    expect(r.env).not.toContain('preload')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    expect(r.chunk).toContain(
      "import { Page } from './route.tsx?tsr-split=export~Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain('function Page() { return Page.displayName }')
    expect(e?.code).toContain("Page.displayName = 'PageDisplay'")
    expect(e?.code).toContain("Page.preload = () => import('./heavy')")
    expect(e?.code).toContain('export { Page }')
    // its effects only augment `Page`: unobservable while nothing imports it
    expect(e?.sideEffectFree).toBe(true)
  })

  // An extracted module is side-effect free: a bundler may skip it while
  // nothing imports what it exports (webpack and Rspack by the hosts' rule),
  // so an effect observable on its own never moves there, even when only
  // the extracted export needs its cluster and no effect would change order:
  // it stays in the env module, which the extracted module imports it from.
  it.each([
    ["function Card() { return 'card' }\n      Card.x = track('card')", 'Card'],
    ["const Card = track('card')", 'Card'],
  ])(
    'keeps an unexported cluster with an effect of its own that only an extracted export reads in the env module (`%s`)',
    async (declaration, binding) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      export function Page() { return ${binding} }
      Page.displayName = 'Page'
      ${declaration}
      track('after')
      export const Route = createFileRoute('/')({ component: Page })
    `)
      const r = await extract(code)
      expect(r.env).toContain("track('card')")
      expect(r.env).toContain(
        "export { Page } from './route.tsx?tsr-split=export~Page'",
      )
      const e = await r.extracted('Page')
      expect(e?.code).toContain(`import { ${binding} } from './route.tsx'`)
      expect(e?.code).not.toContain('track')
      expect(e?.sideEffectFree).toBe(true)
      // the extracted module is no split code: nothing to report
      expect(r.diagnostics).toEqual([])
    },
  )

  it('keeps an export that reads, as it loads, an unexported cluster with an effect of its own', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const base = make()
      export const options = { base }
      export const Route = createFileRoute('/')({ component: () => options.base })
    `)
    const r = await extract(code)
    expect(r.env).toContain('const base = make()')
    expect(r.env).toContain('export const options = { base }')
    expect(r.env).not.toContain('export~')
    expect(r.diagnostics).toMatchObject([{ code: 'eager-export:reads' }])
  })

  // The same cluster before the augmented export: the augmentation would run
  // before that effect, which stays (the order rule below).
  it('keeps an augmented export after an unexported cluster with an effect of its own that it reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      function Card() { return 'card' }
      Card.x = track('card')
      export function Page() { return Card }
      Page.displayName = 'Page'
      track('after')
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("Card.x = track('card')")
    expect(r.env).toContain('export function Page()')
    expect(r.env).not.toContain('export~')
    expect(r.chunk).toContain("import { Page } from './route.tsx'")
    expect(r.diagnostics).toMatchObject([{ code: 'eager-export:order' }])
  })

  it('keeps an augmented export a surviving effect precedes (the augmentation would run before it)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { see } from './see'
      see('before')
      export function Page() { return 'page' }
      Page.displayName = 'PageDisplay'
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("see('before')")
    expect(r.env).toContain('export function Page()')
    expect(r.env).toContain("Page.displayName = 'PageDisplay'")
    expect(r.env).not.toContain('export~')
    expect(r.chunk).toContain("import { Page } from './route.tsx'")
    expect(r.diagnostics).toMatchObject([{ code: 'eager-export:order' }])
  })

  it('extracts an augmented export a surviving effect follows (the effect keeps its order)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { see } from './see'
      export function Page() { return 'page' }
      Page.displayName = 'PageDisplay'
      see('after')
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("see('after')")
    expect(r.env).not.toContain('displayName')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Page.displayName = 'PageDisplay'")
    expect(e?.code).not.toContain("see('after')")
  })

  it('extracts an augmented export a bare import precedes (module loading is hoisted: it is no effect before it)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import './side.css'
      export function Page() { return 'page' }
      Page.displayName = 'PageDisplay'
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain("import './side.css'")
    expect(r.env).not.toContain('displayName')
    expect(r.env).toContain(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Page.displayName = 'PageDisplay'")
  })

  it('extracts two augmented exports, re-exported in source order', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Card() { return 'card' }
      Card.displayName = 'Card'
      export function Page() { return Card() }
      Page.displayName = 'Page'
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('displayName')
    const card = r.env.indexOf(
      "export { Card } from './route.tsx?tsr-split=export~Card'",
    )
    const page = r.env.indexOf(
      "export { Page } from './route.tsx?tsr-split=export~Page'",
    )
    expect(card).toBeGreaterThan(-1)
    expect(page).toBeGreaterThan(card)
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Page.displayName = 'Page'")
    expect(e?.code).toContain(
      "import { Card } from './route.tsx?tsr-split=export~Card'",
    )
    expect((await r.extracted('Card'))?.code).toContain(
      "Card.displayName = 'Card'",
    )
  })

  it('keeps an exported effectful initialiser only a chunk needs (its module could never be dropped as unused)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createTheme } from './theme'
      export const theme = createTheme()
      function Page() { return theme.page }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export const theme = createTheme()')
    expect(r.env).not.toContain('export~')
    expect(r.chunk).toContain("import { theme } from './route.tsx'")
  })

  it('keeps an augmented export whose augmentation reads what the env module keeps at its evaluation', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const config = { label: 'label' }
      export const label = config.label
      export function Page() { return 'page' }
      Page.label = config.label
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export function Page()')
    expect(r.env).toContain('Page.label = config.label')
    expect(r.env).not.toContain('export~')
  })

  it.each([
    ["Page.displayName = 'Page'", true],
    ["Page.preload = () => import('./heavy')", true],
    ['Page.count += 1', true],
    ['Page.meta.title = `x`', true],
    ["Object.assign(Page, { title: 'x' })", true],
    ["Page['k'] = 1", true],
    ["Page.x = track('page')", false],
    ["Page.x ??= track('page')", false],
    ["Object.assign(Page, { x: track('page') })", false],
    ["Page[track('k')] = 1", false],
    ['Page.count++', false],
  ])(
    'extracts an export augmented by `%s` only when the augmentation writes nothing but pure values (%s)',
    async (augmentation, extracted) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      export function Page() { return 'page' }
      ${augmentation}
      export const Route = createFileRoute('/')({ component: Page })
    `)
      const r = await extract(code)
      expect(r.env.includes('export~Page')).toBe(extracted)
    },
  )

  it('keeps an augmented export whose augmentation has an effect of its own (its module could never be dropped as unused)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      export function Page() { return 'page' }
      Page.x = track('page')
      track('after')
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export function Page()')
    expect(r.env).toContain("Page.x = track('page')")
    expect(r.env).not.toContain('export~')
    expect(r.chunk).toContain("import { Page } from './route.tsx'")
    expect(r.diagnostics).toMatchObject([{ code: 'eager-export:effects' }])
  })
})

describe('a statement relying on the `;` that ends the one before it', () => {
  // `;(x as any).y = 1` in semicolon-free code: the `;` ends the previous
  // statement, so the statement needs one of its own once that statement is
  // dropped or it follows another statement in a derived output
  it('keeps its `;` when the statement before it is dropped', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { see } from './see'
      export const serverFn = wrapServer(() => secret)
      const secret = see('secret')
      ;[1, 2].forEach(see)
      export const Route = createFileRoute('/')({ component: () => 1 })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const env =
      (await host.compile('/app/route.tsx', [toyEnvPlanner()]))?.code ?? ''
    expect(env).not.toContain('secret')
    expect(env).toContain(
      'export const serverFn = tsrStub()\n;[1, 2].forEach(see)',
    )
  })

  it('gets a `;` when it moves after another statement', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { see } from './see'
      const Page = () => Page.title
      see('between')
      ;(Page as any).title = 'title'
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.env).toContain("see('between')\n")
    expect(r.chunks.component).toContain(
      "const Page = () => Page.title\n;(Page as any).title = 'title'",
    )
  })

  it('keeps the source unchanged where the statement before it stays', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { see } from './see'
      see('first')
      ;[1, 2].forEach(see)
      export const Route = createFileRoute('/')({ component: () => 1 })
    `)
    const r = await split(code)
    expect(r.env).toContain("see('first')\n;[1, 2].forEach(see)")
    expect(r.env).not.toContain(';;')
  })
})

describe('route-module specifics (lane router)', () => {
  it('drops `export { X }` of an inline type-only import with the import (route module)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { type Settings } from './settings'
      export { Settings }
      export const Route = createFileRoute('/')({
        component: () => 1,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('Settings')
    expect(r.chunks.component).not.toContain('Settings')
  })

  it('keeps a pragma comment written after the imports non-leading in a chunk (J2.16)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      /** @jsxImportSource @emotion/react */
      function Page() {
        return <div css={{ color: 'red' }}>styled</div>
      }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.chunks.component).toMatch(
      /^export \{\}\n\/\*\* @jsxImportSource @emotion\/react \*\/\nfunction Page/,
    )
  })

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

  it('rewrites the import assertion keyword, not a comment naming it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import a from './a.json' /* assert */ assert { type: 'json' }
      import b from './b.json' /* assert */ with { type: 'json' }
      export const Route = createFileRoute('/')({
        loader: () => 'data',
        component: () => a.title + b.title,
      })
    `)
    const r = await split(code)
    expect(r.chunks.component).toContain(
      "import a from './a.json' /* assert */ with { type: 'json' }",
    )
    expect(r.chunks.component).toContain(
      "import b from './b.json' /* assert */ with { type: 'json' }",
    )
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

  // Source: tanstack.com `ds.typography.tsx`: `import type * as React from
  // 'react'` and JSX in the split component gave the chunk `import { React }`
  // from the route module, which exported a type-only binding (Rolldown:
  // MISSING_EXPORT). A binding without a runtime value is never the factory.
  it.each([
    ['a type-only namespace import', "import type * as React from 'react'"],
    ['a type-only default import', "import type React from 'react'"],
    ['a type-only named import', "import type { React } from 'react'"],
    // (an inline `type` specifier follows its statement's value specifiers)
    [
      'an inline type specifier',
      "import { type React, useId } from 'react'",
      "import { useId } from 'react'",
    ],
    ['an interface', 'interface React { node: unknown }'],
  ])(
    'never reads %s named React as the JSX factory',
    async (_, declaration, kept = declaration) => {
      const code = dedent(`
        ${declaration}
        import { createFileRoute } from 'toy-router'
        export const Route = createFileRoute('/')({ component: () => <p>classic</p> })
      `)
      const r = await split(code)
      expect(r.chunks.component).not.toContain('React')
      expect(r.env).not.toContain('export { React }')
      expect(r.env).toContain(kept)
    },
  )

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

  it('reads no Solid use: directive whose name is bound to a type only', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import type { tip } from './tips'
      export const Route = createFileRoute('/')({ component: () => <p use:tip>tip</p> })
    `)
    const r = await split(code)
    expect(r.chunks.component).not.toContain('tip }')
    expect(r.env).toContain("import type { tip } from './tips'")
    expect(r.env).not.toContain('export { tip }')
  })
})

describe('generated units at the header', () => {
  it('renders them once when the import statement the core rewrites starts with a leading comment', async () => {
    // the import loses `useThing` (only the split component reads it): its
    // recipe keeps the comment before it, where after-header units render
    // (the react-start and solid-start e2e apps: root routes starting with
    // `/// <reference types="vite/client" />`)
    const code = `/// <reference types="vite/client" />
import { createFileRoute, useThing } from 'toy-router'
export const Route = createFileRoute('/')({
  component: Page,
})
function Page() {
  return useThing()
}
`
    const r = await split(code)
    expect(r.env.split('const tsrImportComponent =')).toHaveLength(2)
    expect(
      r.env.split("import { lazyRouteComponent } from 'toy-router'"),
    ).toHaveLength(2)
    expect(r.env).toContain('/// <reference types="vite/client" />')
    expect(r.env).toContain("import { createFileRoute } from 'toy-router'")
  })
})

describe('provenance-based orphans', () => {
  it('keeps a pre-existing disconnected effectful cycle', async () => {
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

  it('keeps an import still referenced by an export specifier', async () => {
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

describe('ordered evaluation and movable effects', () => {
  it('co-locates an eager reader between two augmentations with the route module', async () => {
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

  it('moves an effectful initialiser followed only by the route factory chain', async () => {
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

  it('keeps the initialiser eager when a surviving effect follows it', async () => {
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

  it('moves consecutive effectful initialisers one chunk needs together, in source order', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const a = make('a')
      const b = make('b')
      const c = make('c')
      export const Route = createFileRoute('/')({
        component: () => a + b + c,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('make(')
    expect(r.chunks.component).toContain(
      "const a = make('a')\nconst b = make('b')\nconst c = make('c')",
    )
  })

  it('keeps the initialisers before a surviving effect eager and moves the ones after it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      import { advance } from './clock'
      import { build } from './build'
      const a = make('a')
      advance()
      const b = build('b')
      const c = build('c')
      export const Route = createFileRoute('/')({
        component: () => a + b + c,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("const a = make('a')\nadvance()")
    expect(r.env).not.toContain('build(')
    expect(r.chunks.component).toContain("import { a } from './route.tsx'")
    expect(r.chunks.component).toContain(
      "const b = build('b')\nconst c = build('c')",
    )
  })

  it('keeps an initialiser eager when a later one moves to another chunk', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      import { other } from './other'
      const a = make('a')
      const b = other('b')
      export const Route = createFileRoute('/')({
        component: () => a,
        errorComponent: () => b,
      })
    `)
    const r = await split(code, { keys: ['component', 'errorComponent'] })
    expect(r.env).toContain("const a = make('a')")
    expect(r.env).not.toContain("other('b')")
    expect(r.chunks.component).toContain("import { a } from './route.tsx'")
    expect(r.chunks.errorComponent).toContain("const b = other('b')")
  })

  it('moves an initialiser whose import the route module also reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const kept = make('kept')
      const page = make('page')
      export const Route = createFileRoute('/')({
        loader: () => kept,
        component: () => kept + page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("const kept = make('kept')")
    expect(r.env).not.toContain("make('page')")
    expect(r.chunks.component).toContain("import { make } from './make'")
    expect(r.chunks.component).toContain("const page = make('page')")
  })

  it('keeps an initialiser reading an effectful binding eager, with that binding', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const store = make('store')
      const view = store.read()
      export const Route = createFileRoute('/')({
        component: () => view,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain(
      "const store = make('store')\nconst view = store.read()",
    )
    expect(r.chunks.component).toContain("import { view } from './route.tsx'")
    expect(r.chunks.component).not.toContain('make(')
  })

  it('moves an initialiser reading a const the route module keeps', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const q = { kept: make('kept'), tv: make('tv') }
      const page = [make('page'), q.tv]
      export const Route = createFileRoute('/')({
        loader: () => q.kept,
        component: () => page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("const q = { kept: make('kept'), tv: make('tv') }")
    expect(r.env).not.toContain("make('page')")
    expect(r.chunks.component).toContain("import { q } from './route.tsx'")
    expect(r.chunks.component).toContain("const page = [make('page'), q.tv]")
  })

  it.each([
    ['reassigned', 'let', 'q = { tv: 1 }'],
    ['a let', 'let', 'q.tv'],
    ['member-written', 'const', 'q.tv = 1'],
    ['nested-member-written', 'const', 'q.tv.x++'],
    ['member-deleted', 'const', 'delete q.tv'],
    ['member-destructured into', 'const', '[q.tv] = [1]'],
    ['mutated by a method', 'const', 'q.list.push(1)'],
    ['mutated by Object.assign', 'const', 'Object.assign(q, {})'],
  ])(
    'keeps an initialiser reading a kept binding that is %s eager',
    async (_, kind, loader) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { make } from './make'
        ${kind} q = { tv: make('tv'), list: [] }
        const page = [make('page'), q.tv]
        export const Route = createFileRoute('/')({
          loader: () => { ${loader} },
          component: () => page,
        })
      `)
      const r = await split(code)
      expect(r.env).toContain("const page = [make('page'), q.tv]")
      expect(r.chunks.component).toContain("import { page } from './route.tsx'")
    },
  )

  it('keeps an initialiser reading a kept const eager when a later effect stays', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const q = make('q')
      const page = [make('page'), q]
      const later = make('later')
      export const Route = createFileRoute('/')({
        loader: () => q + later,
        component: () => page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain(
      "const q = make('q')\nconst page = [make('page'), q]\nconst later = make('later')",
    )
    expect(r.chunks.component).toContain("import { page } from './route.tsx'")
  })

  it('keeps a cluster eager when an effect follows its first effectful item', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { first, second } from './make'
      import { log } from './log'
      function Page() { return Page.a + Page.b }
      Page.a = first()
      log()
      Page.b = second()
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('Page.a = first()\nlog()\nPage.b = second()')
    expect(r.chunks.component).toContain("import { Page } from './route.tsx'")
    expect(r.chunks.component).not.toContain('first()')
  })

  it('moves a cluster when the effect before its first effectful item stays', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { first, second } from './make'
      import { log } from './log'
      function Page() { return Page.a + Page.b }
      log()
      Page.a = first()
      Page.b = second()
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('log()')
    expect(r.env).not.toContain('first()')
    expect(r.chunks.component).toContain('Page.a = first()\nPage.b = second()')
  })

  it('keeps an initialiser eager when a later declarator of its statement stays', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      import { log } from './log'
      const page = make('page'), logged = log('logged')
      export const Route = createFileRoute('/')({
        component: () => page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("make('page')")
    expect(r.env).toContain("log('logged')")
    expect(r.chunks.component).toContain("import { page } from './route.tsx'")
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

  it('moves a component with its own top-level property write (a binding and its augmentations are one cluster)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function Page() { return Page.displayName }
      Page.displayName = 'PageDisplay'
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('displayName')
    expect(r.env).not.toContain('function Page')
    expect(r.chunks.component).toContain('function Page()')
    expect(r.chunks.component).toContain("Page.displayName = 'PageDisplay'")
  })

  it('keeps an augmented component in the route module when the route module reads it eagerly', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { register } from './registry'
      function Page() { return Page.displayName }
      Page.displayName = 'PageDisplay'
      register(Page)
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("Page.displayName = 'PageDisplay'")
    expect(r.env).toContain('register(Page)')
    expect(r.chunks.component).toContain("import { Page } from './route.tsx'")
    expect(r.chunks.component).not.toContain('displayName')
  })

  it('moves a destructured call result only one chunk needs', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const [Page] = make()
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('make()')
    expect(r.chunks.component).toContain('const [Page] = make()')
  })

  it('keeps a destructured binding a chunk imports in the pattern the route module keeps', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const views = { Home: () => 'home', Skeleton: () => 'skeleton' }
      const { Home, Skeleton } = views
      export const Route = createFileRoute('/')({
        component: Home,
        pendingComponent: Skeleton,
      })
    `)
    // (an identifier option value: the real splitter's env edit + chunk root)
    const r = await split(code, { identifierEdits: true })
    expect(r.env).toContain('const { Home, Skeleton } = views')
    expect(r.chunks.component).toMatch(
      /import \{ Home\b[^}]*\} from '\.\/route\.tsx'/,
    )
  })

  it('drops a destructured binding only a call every output erases reads inside a split option, with the import its default reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { secret } from './db'
      const { picked = secret(), kept } = source
      export const k = kept
      export const Route = createFileRoute('/')({
        component: () => wrapServer(() => picked),
      })
    `)
    const r = await split(code, {
      files: { '/app/db.ts': `export const secret = () => 's'\n` },
    })
    expect(r.env).toContain('const { kept } = source')
    expect(r.env).not.toContain('secret')
    expect(r.chunks.component).not.toContain('secret')
  })

  it('keeps an exported destructured binding a chunk reads in the pattern the route module keeps', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const views = { Home: () => 'home', Skeleton: () => 'skeleton' }
      export const { Home, Skeleton } = views
      export const Route = createFileRoute('/')({
        component: Home,
        pendingComponent: Skeleton,
      })
    `)
    // (an identifier option value: the real splitter's env edit + chunk root)
    const r = await split(code, { identifierEdits: true })
    expect(r.env).toContain('export const { Home, Skeleton } = views')
    expect(r.chunks.component).toMatch(
      /import \{ Home\b[^}]*\} from '\.\/route\.tsx'/,
    )
  })

  it('reports a value declared by an effect the route module keeps (env-declared) instead of importing it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const [Page, Other] = make()
      export const Route = createFileRoute('/')({
        component: Page,
        errorComponent: Other,
      })
    `)
    const r = await split(code, { keys: ['component', 'errorComponent'] })
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { component: 'env-declared', errorComponent: 'env-declared' },
    })
    expect(r.env).toContain('const [Page, Other] = make()')
    expect(r.env).toContain('component: Page,')
    expect(r.env).toContain('errorComponent: Other,')
    expect(r.env).not.toContain('export { Page')
  })

  it('imports an exported pure component the route module also reads (no env-declared report for the export itself)', async () => {
    // J2.8's "exported" pattern is a value merged with an exported binding
    // it writes; the value being the export itself is imported from the env module
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function page() { return 'x' }
      export const Route = createFileRoute('/')({
        component: page,
        loader: () => page.name,
      })
    `)
    const r = await split(code, { identifierEdits: true })
    expect(r.main?.facts.planners['toy-split']).toBeUndefined()
    expect(r.env).toContain('export function page()')
    expect(r.env).toContain(
      "lazyRouteComponent(tsrImportComponent, 'component')",
    )
    expect(r.chunks.component).toContain("import { page } from './route.tsx'")
  })

  it('reports a split value that writes an exported binding (one cluster with it, kept by the export: env-declared)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export let count = 0
      function Page() { count++; return count }
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { component: 'env-declared' },
    })
    expect(r.env).toContain('component: Page,')
    expect(r.env).toContain('function Page()')
  })

  it('keeps an initialiser eager when a later one is kept for an orphaned-by-us effectful reader (d over the final roots)', async () => {
    // `Y` is read only by the erased server fn and the component; it is
    // effectful and reads `let kept`, so it cannot move: it stays in the
    // route module for the component, and so does `X`, which it reads lazily.
    // `Z` precedes `X` in source order, so it may not move to the chunk
    // (where it would evaluate after `X`): the root decision must see `X`
    // staying before (d) is decided for `Z`.
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { make } from './make'
      import { eff } from './eff'
      let kept = make('kept')
      const Y = eff(() => X, kept)
      export const serverFn = wrapServer(() => Y)
      const Z = eff('z')
      const X = eff('x')
      export const Route = createFileRoute('/')({
        loader: () => kept,
        component: () => [Z, X, Y],
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('const Y = eff(() => X, kept)')
    expect(r.env).toContain("const X = eff('x')")
    expect(r.env).toContain("const Z = eff('z')")
    expect(r.chunks.component).not.toContain('eff(')
    expect(r.chunks.component).toContain(
      "import { Y, Z, X } from './route.tsx'",
    )
  })
})

describe('needers and homes', () => {
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

  it('evaluates the reads of an env-homed cluster in the env module when a chunk imports it (an identifier option is no shared need)', async () => {
    // the splitter replaces `component: Page` in the env output only; a
    // chunk importing `Route` reads what Route evaluates there (no `Page`),
    // so `Page` lands in the component chunk, not in a shared module
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { fmt } from './util'
      function Page() { return fmt(1) }
      export const Route = createFileRoute('/')({
        loader: () => Route.id,
        component: Page,
      })
    `)
    const r = await split(code, {
      keys: ['loader', 'component'],
      identifierEdits: true,
      files: { '/app/util.ts': 'export const fmt = String\n' },
    })
    expect(r.chunks.component).toContain('function Page()')
    expect(r.chunks.component).toContain("import { fmt } from './util'")
    expect(r.chunks.loader).toContain("import { Route } from './route.tsx'")
    expect(r.chunks.loader).not.toContain('Page')
    const outputs = [
      ...r.host.caches.plans.get(r.env ? 'client' : 'client')!.values(),
    ].flatMap((e) => Object.keys(e.plan.outputs))
    expect(outputs.some((o) => o.includes('shared~'))).toBe(false)
  })

  it('copies an import only into outputs that read it, not into one importing its reader', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { fmt } from './fmt'
      import { other } from './other'
      export function exported() { return fmt(1) }
      export const Route = createFileRoute('/')({
        component: () => exported() + other(),
      })
    `)
    const r = await split(code)
    expect(r.chunks.component).toBe(
      dedent(`
      import { exported } from './route.tsx'
      import { other } from './other'
      const TsrSplitComponent = () => exported() + other()
      export { TsrSplitComponent as component }
    `),
    )
    expect(r.env).toContain("import { fmt } from './fmt'")
    expect(r.env).not.toContain("from './other'")
  })

  it('allocates collision-free names from the file universe', async () => {
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

  it('keeps the imports a route module never read, and drops the ones only a moved option read', async () => {
    const r = await split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { Unused } from './unused'
        import * as ns from './ns'
        import Comp, { Named } from './comp'
        import Moved from './moved'
        export const Route = createFileRoute('/')({
          component: () => [Comp, Moved],
        })
      `),
    )
    expect(r.env).toContain("import { Unused } from './unused'")
    expect(r.env).toContain("import * as ns from './ns'")
    expect(r.env).toContain("import { Named } from './comp'")
    expect(r.env).not.toContain("'./moved'")
    expect(r.chunks.component).toContain("import Comp from './comp'")
    expect(r.chunks.component).toContain("import Moved from './moved'")
    expect(r.chunks.component).not.toContain('Unused')
    expect(r.chunks.component).not.toContain('Named')
  })

  it('drops a type-only-used value import in route modules and keeps it elsewhere (J2.5)', async () => {
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

  it('keeps an `import type` statement whole and type-only when a value of the same name moves', async () => {
    // TypeScript allows a type-only import and a value of the same name;
    // `import { Label }` would be a runtime import of a type
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import type { Badge, Label } from './labels'
      import type Chip from './chip'
      export type Kept = Label
      function Badge() { return 'badge' }
      function Chip() { return 'chip' }
      function Page() { return [Badge(), Chip()] }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.env).toContain("import type { Badge, Label } from './labels'")
    expect(r.env).toContain("import type Chip from './chip'")
    expect(r.env).not.toContain('function Badge')
    expect(r.chunks.component).toContain('function Badge')
    expect(r.chunks.component).toContain('function Chip')
    expect(r.chunks.component).not.toContain('./labels')
    expect(r.chunks.component).not.toContain('./chip')
  })

  it('drops an inline type specifier of a route module whatever its cluster (J2.5)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { type Badge, label } from './labels'
      function Badge() { return label }
      function Page() { return Badge() }
      export const Route = createFileRoute('/')({
        loader: () => Badge(),
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain("import { label } from './labels'")
    expect(r.env).toContain('function Badge')
    expect(r.chunks.component).not.toContain('./labels')
  })

  it('keeps an `import type` statement type-only when the env erases a value of the same name', async () => {
    const host = new MemoryHost({
      files: {
        '/app/lib.ts': dedent(`
          import { wrapServer } from 'toy-start'
          import type { Badge, Label } from './labels'
          export type Kept = Label
          function Badge() { return 'badge' }
          export const fn = wrapServer(() => Badge())
        `),
      },
    })
    const out = await host.compile('/app/lib.ts', [toyEnvPlanner()])
    expect(out?.code).toContain("import type { Badge, Label } from './labels'")
    expect(out?.code).not.toContain('function Badge')
    expect(out?.edges.map((e) => e.specifier)).not.toContain('./labels')
  })
})

describe('provider outputs (J4.14)', () => {
  it('copies the exported cluster its root reads instead of importing it from the env module', async () => {
    // a provider output is the module's own instance in another layer: its
    // generated wrapper reads the exported `fn`, which stays exported from
    // the env module too (where it is a stub), so the provider owns a copy
    const code = dedent(`
      import { wrapServer } from 'toy-start'
      import { helper } from './helper'
      export const fn = wrapServer(() => helper())
      export const other = 1
    `)
    const host = new MemoryHost({
      files: {
        '/app/fns.ts': code,
        '/app/helper.ts': 'export const helper = () => 1\n',
      },
    })
    const provider: Planner = {
      name: 'toy-provider',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const out = ctx.declareOutput({
          kind: 'provider',
          key: 'provider',
          derived: { kind: 'provider', value: '' },
        })
        const fn = ctx.analysis.exports.find(
          (e) => e.kind === 'local' && e.name === 'fn',
        )
        const sym = (fn?.kind === 'local' ? fn.local : null) as never
        const wrapper = ctx.names.alloc('fn_handler')
        ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [`export const ${wrapper.name} = () => `, { sym }, '\n'],
            },
          ],
          declares: [wrapper.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-provider',
        })
      },
    }
    const env = envInfo({ name: 'ssr', type: 'server' })
    const main = await host.compile(
      '/app/fns.ts',
      [toyEnvPlanner(), provider],
      { env },
    )
    const out = await host.compile(
      '/app/fns.ts?tss-serverfn-split',
      [toyEnvPlanner(), provider],
      { env },
    )
    expect(main?.code).toContain('export const fn = tsrRpc(() => helper())')
    expect(main?.code).not.toContain('fn_handler')
    expect(out?.code).toContain('const fn = tsrRpc(() => helper())')
    expect(out?.code).toContain("import { helper } from './helper'")
    expect(out?.code).toContain('export const fn_handler = () => fn')
    expect(out?.code).not.toContain("from './fns.ts")
    expect(out?.code).not.toContain('other')
  })
})

describe('clusters an env root reads after homing', () => {
  it('keeps a generated import an env-scoped edit reads in a cluster homed in the env module for its derived needers', async () => {
    // `fn` is read by the split component, a provider output and an option
    // the env module erases (so it starts as an orphan of the env module); it
    // is homed in the env module for its derived needers and then rooted there
    // for its effects, and its env rendering reads a generated import no
    // other output reads (Rsbuild RSC SSR: a server fn's `tsrSsrRpc` stub,
    // found by the react-start/rsc e2e app)
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from 'toy-lib'
      const fn = make().handler(async () => 1)
      export const Route = createFileRoute('/')({
        loader: () => fn,
        component: () => fn,
      })
    `)
    const host = new MemoryHost({
      files: { '/app/route.tsx': code },
    })
    const provider: Planner = {
      name: 'toy-provider',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const out = ctx.declareOutput({
          kind: 'provider',
          key: 'provider',
          derived: { kind: 'provider', value: '' },
        })
        const isFn = (s: SymbolId) => ctx.t1.symbols.name(s) === 'fn'
        const decl = ctx.t1.units.find((u) => u.declares.some(isFn))!
        const sym = decl.declares.find(isFn)!
        const handler = 'async () => 1'
        const init = ctx.analysis.source.code.indexOf(handler, decl.range.start)
        const stub = ctx.names.alloc('tsrStub')
        ctx.rewrites.addGenerated({
          body: [],
          declares: [],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: 'toy-provider',
          imports: [
            {
              names: [{ imported: 'stub', local: stub.sym }],
              spec: {
                k: 'spec',
                specifier: 'toy-runtime',
                edgeKey: ctx.edgeKey('toy-runtime', 'static', 'runtime'),
                provenance: { origin: 'runtime' },
              },
            },
          ],
        })
        ctx.rewrites.add({
          range: { start: init, end: init + handler.length },
          body: [{ k: 'text', parts: [{ sym: stub.sym }, "('id')"] }],
          scope: ['env'],
          by: 'toy-provider',
        })
        const wrapper = ctx.names.alloc('fn_handler')
        ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [`export const ${wrapper.name} = () => `, { sym }, '\n'],
            },
          ],
          declares: [wrapper.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-provider',
        })
      },
    }
    const planners = [toySplitPlanner({ deleteNodes: ['loader'] }), provider]
    const env = envInfo({ name: 'ssr', type: 'server' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    expect(main?.code).toContain("const fn = make().handler(tsrStub('id'))")
    expect(main?.code).toContain(
      "import { stub as tsrStub } from 'toy-runtime'",
    )
  })
})

describe('overridden placeholders', () => {
  it('counts the reads of an edit overriding a claimed placeholder for the enclosing region of that output', async () => {
    // a nested server fn chain is claimed for the provider output (hoisted
    // there); the env output keeps the chain in place with an edit on exactly
    // the claimed region: what that edit renders (the chain's head, its
    // options, the stub) is read by the enclosing function in the env output
    const code = dedent(`
      import { wrapServer } from 'toy-start'
      import { secret } from './db'
      import { opt } from './opt'
      const METHOD = 'POST'
      export function make() {
        const fn = wrapServer(opt(METHOD), () => secret())
        return fn
      }
    `)
    const host = new MemoryHost({
      files: {
        '/app/fns.ts': code,
        '/app/db.ts': 'export const secret = () => 1\n',
        '/app/opt.ts': 'export const opt = (m) => ({ m })\n',
      },
    })
    const call = 'wrapServer(opt(METHOD), () => secret())'
    const handler = '() => secret()'
    const provider: Planner = {
      name: 'toy-provider',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const out = ctx.declareOutput({
          kind: 'provider',
          key: 'provider',
          derived: { kind: 'provider', value: '' },
        })
        const start = code.indexOf(call)
        const range = { start, end: start + call.length }
        const hStart = code.indexOf(handler, start)
        const stub = ctx.names.alloc('tsrStub')
        ctx.rewrites.addGenerated({
          body: [],
          declares: [],
          effectful: false,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: 'toy-provider',
          imports: [
            {
              names: [{ imported: 'stub', local: stub.sym }],
              spec: {
                k: 'spec',
                specifier: 'toy-runtime',
                edgeKey: ctx.edgeKey('toy-runtime', 'static', 'runtime'),
                provenance: { origin: 'runtime' },
              },
            },
          ],
        })
        const hoisted = ctx.names.alloc('tsrServerFn')
        const owner = ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${hoisted.name} = `] },
            { k: 'slice', range },
            { k: 'text', parts: ['\n'] },
          ],
          declares: [hoisted.sym],
          effectful: false,
          anchor: { k: 'after-header' },
          home: out,
          by: 'toy-provider',
        })
        ctx.rewrites.claim({
          region: ctx.region(range, 'nested-chain'),
          owner,
          placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
          by: 'toy-provider',
        })
        ctx.rewrites.add({
          range,
          body: [
            { k: 'slice', range: { start, end: hStart } },
            { k: 'text', parts: [{ sym: stub.sym }, "('id')"] },
            {
              k: 'slice',
              range: { start: hStart + handler.length, end: range.end },
            },
          ],
          scope: ['env'],
          by: 'toy-provider',
        })
        const wrapper = ctx.names.alloc('fn_handler')
        ctx.rewrites.addGenerated({
          body: [
            {
              k: 'text',
              parts: [
                `export const ${wrapper.name} = () => `,
                { sym: hoisted.sym },
                '\n',
              ],
            },
          ],
          declares: [wrapper.sym],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-provider',
        })
      },
    }
    const env = envInfo({ name: 'rsc', type: 'server' })
    const main = await host.compile('/app/fns.ts', [provider], { env })
    expect(main?.code).toContain(
      "const fn = wrapServer(opt(METHOD), tsrStub('id'))",
    )
    expect(main?.code).toContain("import { wrapServer } from 'toy-start'")
    expect(main?.code).toContain("import { opt } from './opt'")
    expect(main?.code).toContain("const METHOD = 'POST'")
    expect(main?.code).toContain(
      "import { stub as tsrStub } from 'toy-runtime'",
    )
    expect(main?.code).not.toContain('./db')
    expect(main?.code).not.toContain('tsrServerFn')
    const out = await host.compile(
      '/app/fns.ts?tss-serverfn-split',
      [provider],
      {
        env,
      },
    )
    expect(out?.code).toContain(
      'const tsrServerFn = wrapServer(opt(METHOD), () => secret())',
    )
    expect(out?.code).toContain("import { secret } from './db'")
    expect(out?.code).toContain("const METHOD = 'POST'")
    expect(out?.code).not.toContain('tsrStub')
  })
})

describe('pre-existing dead code (G16)', () => {
  it('keeps a dead pure cycle like a dead self-recursive function', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { helper } from './helper'
      function a() { return b() }
      function b() { return a() }
      function self() { return self() }
      export const Route = createFileRoute('/')({ component: () => helper() })
    `)
    const r = await split(code)
    expect(r.env).toContain('function self()')
    expect(r.env).toContain('function a()')
    expect(r.env).toContain('function b()')
    expect(r.chunks.component).not.toContain('function a()')
  })
})

describe('one mutation model: eager reads of state something writes', () => {
  it('keeps every writer in place when single-writer fallbacks cascade past three rounds', async () => {
    // each component writes a module `let` the previous one reads; the
    // route module reads only `a`, so every round frees one more writer
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let a = 0, b = 0, c = 0
      export const Route = createFileRoute('/')({
        loader: () => a,
        component: () => { a = 1; return b },
        errorComponent: () => { b = 1; return c },
        notFoundComponent: () => { c = 1; return null },
      })
    `)
    const keys = ['component', 'errorComponent', 'notFoundComponent']
    const r = await split(code, { keys })
    for (const key of keys) {
      // a chunk never assigns a binding it imports
      expect(r.chunks[key]).not.toMatch(/import \{[^}]*\b[abc]\b[^}]*\} from/)
      expect(r.chunks[key]).toBe('export {}\n')
    }
    expect(r.env).toContain('component: () => { a = 1; return b }')
    expect(r.env).toContain('errorComponent: () => { b = 1; return c }')
    expect(r.env).toContain('notFoundComponent: () => { c = 1; return null }')
  })

  it.each([
    ['an array literal', 'const initial = [n]', 'initial[0]'],
    ['an object literal', 'const initial = { n }', 'initial.n'],
    ['a template literal', 'const initial = `${n}`', 'initial'],
    ['a static class field', 'class Snap { static value = n }', 'Snap.value'],
  ])(
    'keeps %s that reads a binding a function writes in the route module',
    async (_, declaration, read) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let n = 0
        export function inc() { n++ }
        ${declaration}
        export const Route = createFileRoute('/')({
          component: () => ${read},
        })
      `)
      const r = await split(code)
      expect(r.env).toContain(declaration)
      expect(r.chunks.component).not.toContain(declaration)
      expect(r.chunks.component).toMatch(
        /import \{[^}]*\b(initial|Snap)\b[^}]*\} from '\.\/route\.tsx'/,
      )
    },
  )

  it('treats an immediately invoked function as eager: its read of a member something writes pins it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const cfg = { n: 1 }
      export function bump() { cfg.n++ }
      const snapshot = (() => cfg.n)()
      export const Route = createFileRoute('/')({
        component: () => snapshot,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('const snapshot = (() => cfg.n)()')
    expect(r.chunks.component).not.toContain('(() => cfg.n)()')
    expect(r.chunks.component).toContain(
      "import { snapshot } from './route.tsx'",
    )
  })

  it.each([
    ['the callee of a call', 'const initial = (() => n)()', true],
    ['an element computed by a call', 'const initial = [(() => n)()]', true],
    [
      'called through .call',
      'const initial = (function () { return n }).call(null)',
      true,
    ],
    [
      'a branch of a conditional',
      'const initial = cond ? (() => n)() : 0',
      true,
    ],
    ['negated and called', 'const initial = !function () { return n }()', true],
    [
      'an argument of a call whose result is called',
      'const initial = wrap(() => n)()',
      false,
    ],
    ['an argument of a call', 'const initial = wrap(() => n)', false],
  ])(
    'classifies a function that is %s as %s',
    async (_, declaration, eager) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { wrap } from './state'
        const cond = true
        let n = 0
        export function inc() { n++ }
        ${declaration}
        export const Route = createFileRoute('/')({
          component: () => initial,
        })
      `)
      const r = await split(code, {
        files: {
          '/app/state.ts': 'export const wrap = (f: () => number) => f\n',
        },
      })
      // an eager read of a binding a function writes keeps the declaration
      // in the route module; a lazy one lets it move with the component
      expect(r.env.includes(declaration)).toBe(eager)
      expect((r.chunks.component ?? '').includes(declaration)).toBe(!eager)
    },
  )

  it('still moves an immediately invoked function reading a const nothing writes', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const cfg = { n: 1 }
      const snapshot = (() => cfg.n)()
      export const Route = createFileRoute('/')({
        component: () => snapshot,
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('const snapshot')
    expect(r.chunks.component).toContain('const snapshot = (() => cfg.n)()')
    expect(r.chunks.component).toContain("import { cfg } from './route.tsx'")
  })

  it('pins an effectful initialiser that reads a pure object a function mutates', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { read } from './state'
      export const cfg = { n: 1 }
      export function bump() { cfg.n++ }
      const snapshot = read(cfg.n)
      export const Route = createFileRoute('/')({
        component: () => snapshot,
      })
    `)
    const r = await split(code, {
      files: { '/app/state.ts': 'export const read = (v: number) => v\n' },
    })
    expect(r.env).toContain('const snapshot = read(cfg.n)')
    expect(r.chunks.component).not.toContain('read(cfg.n)')
    expect(r.chunks.component).toContain(
      "import { snapshot } from './route.tsx'",
    )
  })

  it('keeps an option value that reads a binding a function writes in place (ordered-effect)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { makeComp } from './state'
      let n = 0
      export function inc() { n++ }
      export const Route = createFileRoute('/')({
        component: makeComp(n),
      })
    `)
    const r = await split(code, {
      files: {
        '/app/state.ts': 'export const makeComp = (v: number) => () => v\n',
      },
    })
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      notSplittable: 'component',
      reasons: { component: 'ordered-effect' },
    })
    expect(r.env).toContain('component: makeComp(n)')
    expect(r.chunks.component).toBe('export {}\n')
  })

  it('declares the route unit benign only when its option values are pure', async () => {
    const state =
      'export const createStore = () => ({ get: () => 1 })\nexport const makeSchema = () => ({})\n'
    const impure = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore, makeSchema } from './state'
      const store = createStore()
      function Page() { return store.get() }
      export const Route = createFileRoute('/')({
        component: Page,
        validateSearch: makeSchema(),
      })
    `)
    const r = await split(impure, { files: { '/app/state.ts': state } })
    // `makeSchema()` runs at route creation, after `createStore()` in the
    // source: the store stays eager in the route module, the chunk imports it
    expect(r.env).toContain('const store = createStore()')
    expect(r.chunks.component).not.toContain('createStore()')
    expect(r.chunks.component).toContain("import { store } from './route.tsx'")

    const pure = impure.replace(
      'validateSearch: makeSchema(),',
      'validateSearch: (s) => s,',
    )
    const p = await split(pure, { files: { '/app/state.ts': state } })
    expect(p.env).not.toContain('const store = createStore()')
    expect(p.chunks.component).toContain('const store = createStore()')
  })

  it('removes a server-only initialiser only an erased handler writes from the client', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { connect } from './db.server'
      let socket = connect()
      export const ping = wrapServer(() => { socket = connect() })
      export const Route = createFileRoute('/')({
        component: () => null,
      })
    `)
    const r = await split(code, {
      files: { '/app/db.server.ts': 'export const connect = () => ({})\n' },
    })
    expect(r.env).not.toContain('connect()')
    expect(r.env).not.toContain('db.server')
    const s = await split(code, {
      env: 'server',
      files: { '/app/db.server.ts': 'export const connect = () => ({})\n' },
    })
    expect(s.env).toContain('let socket = connect()')
  })
})

// A declaration only split code needs that the movable test keeps in the
// route module (evaluation order, writes, eager reads) is reported once, at its
// cause, positioned at the declaration and naming why; nothing is reported
// when it moves, or when the split code needs nothing pinned.
describe('declarations only split code needs that stay in the route module', () => {
  async function kept(
    code: string,
    keys = ['component'],
    env: EnvInfo = envInfo({ mode: 'build' }),
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ keys })]
    const out = await host.compile('/app/route.tsx', planners, { env })
    return {
      env: out?.code ?? '',
      diagnostics: (out?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      ),
    }
  }
  const lineOf = (code: string, needle: string) =>
    code.slice(0, code.indexOf(needle)).split('\n').length

  // tamery's account route: `validateSearch: type({…})` stays and runs
  // after `confetti`
  const pinned = dedent(`
    import { createFileRoute } from 'toy-router'
    import { type } from 'arktype'
    import JSConfetti from 'js-confetti'
    const confetti = new JSConfetti()
    export const Route = createFileRoute('/')({
      validateSearch: type({ 'a?': 'string' }),
      component: () => confetti.addConfetti(),
    })
  `)

  it('reports a declaration a later surviving effect keeps in place, naming the effect, its option and line', async () => {
    const r = await kept(pinned)
    expect(r.env).toContain('const confetti = new JSConfetti()')
    expect(r.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: 'eager-split:order',
        by: 'core',
        range: { start: pinned.indexOf('confetti = new') },
      },
    ])
    const message = r.diagnostics[0]!.message
    for (const part of [
      '`confetti`',
      '/app/route.tsx',
      'the call `type(…)` in `validateSearch`',
      `(line ${lineOf(pinned, 'type({')})`,
      // the least effort first
      'declare `confetti` after `Route`, create that value in a `const` before `confetti`, or mark the call `/* @__PURE__ */` if it has no side effects',
      'the split `component`',
    ]) {
      expect(message).toContain(part)
    }
    // the route planner names the module: tagged like its own warnings
    expect(message).toMatch(
      /^\[tanstack-router\] `confetti` in "\/app\/route\.tsx" stays in the route module because /,
    )
  })

  // the planners word what the core reports: a Hydrate chunk is named as
  // its boundary, and a module no planner describes is just "the module"
  it('names the split outputs and the module with the words their planners give', async () => {
    const code = dedent(`
      import { Hydrate } from 'toy-start'
      import JSConfetti from 'js-confetti'
      const confetti = new JSConfetti()
      log()
      export function Page() { return <Hydrate><p>{confetti.x}</p></Hydrate> }
    `)
    const host = new MemoryHost({ files: { '/app/mod.tsx': code } })
    const out = await host.compile('/app/mod.tsx', [toyHydratePlanner()], {
      env: envInfo({ mode: 'build' }),
    })
    expect(out!.diagnostics).toMatchObject([{ code: 'eager-split:order' }])
    expect(out!.diagnostics[0]!.message).toMatch(
      /^`confetti` in "\/app\/mod\.tsx" stays in the module because .*, so `confetti` can load with the split `<Hydrate>` boundary\.$/,
    )
  })

  it('reports nothing when the declaration moves, or when the split code needs nothing pinned', async () => {
    for (const code of [
      pinned.replace('type({', '/* @__PURE__ */ type({'),
      // the schema declared first: no effect after `confetti` stays
      pinned
        .replace(
          'const confetti',
          "const search = type({ 'a?': 'string' })\nconst confetti",
        )
        .replace(/validateSearch: type\(\{[^}]*\}\)/, 'validateSearch: search'),
      // declared after the route: it never crosses the call
      pinned
        .replace('const confetti = new JSConfetti()\n', '')
        .concat('const confetti = new JSConfetti()\n'),
      // a callee declared without side effects in the route file
      pinned
        .replace("import { type } from 'arktype'\n", '')
        .replace(
          'const confetti',
          '/* #__NO_SIDE_EFFECTS__ */ function type(shape) { return shape }\nconst confetti',
        ),
      // declared after the call (hoisted): the annotation counts in any
      // order, for the option value and for a declaration's initialiser
      pinned
        .replace("import { type } from 'arktype'\n", '')
        .concat(
          '/* #__NO_SIDE_EFFECTS__ */ function type(shape) { return shape }\n',
        ),
      pinned
        .replace("import { type } from 'arktype'\n", '')
        .replace(
          'export const Route',
          "const search = type({ 'a?': 'string' })\nexport const Route",
        )
        .replace(/validateSearch: type\(\{[^}]*\}\)/, 'validateSearch: search')
        .concat(
          '/* #__NO_SIDE_EFFECTS__ */ function type(shape) { return shape }\n',
        ),
      dedent(`
        import { createFileRoute } from 'toy-router'
        export const Route = createFileRoute('/')({
          validateSearch: (s) => s,
          component: () => 'page',
        })
      `),
    ]) {
      const r = await kept(code)
      expect(r.env, code).not.toContain('new JSConfetti')
      expect(r.diagnostics, code).toEqual([])
    }
  })

  it('suggests #__NO_SIDE_EFFECTS__ for a callee the route file declares', async () => {
    const code = pinned
      .replace("import { type } from 'arktype'\n", '')
      .replace(
        'const confetti',
        'function type(shape) { return shape }\nconst confetti',
      )
    const r = await kept(code)
    expect(r.diagnostics[0]!.message).toContain(
      '`const` before `confetti`, mark `type` `/* #__NO_SIDE_EFFECTS__ */`, or mark the call `/* @__PURE__ */` if it has no side effects',
    )
  })

  it('reports a plain statement after it, an effect several split options need, writes and reads of state', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make, wrap, log } from './lib'
      const first = make()
      log('ready')
      let n = 0
      const snapshot = [n]
      function inc() { n++ }
      const shared = make()
      const registry = make()
      registry.add(1)
      const client = make()
      const api = wrap(client)
      export const Route = createFileRoute('/')({
        component: () => [first, snapshot, inc(), shared, registry, api],
        errorComponent: () => shared,
      })
    `)
    const r = await kept(code, ['component', 'errorComponent'])
    const byName: Record<string, (typeof r.diagnostics)[number]> =
      Object.fromEntries(
        r.diagnostics.map((d) => [/`(\w+)` in "/.exec(d.message)![1]!, d]),
      )
    expect(Object.keys(byName).sort()).toEqual([
      'api',
      'first',
      'registry',
      'shared',
      'snapshot',
    ])
    expect(byName.first).toMatchObject({ code: 'eager-split:order' })
    expect(byName.first!.message).toContain(
      `the call \`log(…)\` (line ${lineOf(code, "log('ready')")}) runs after it and stays`,
    )
    expect(byName.shared).toMatchObject({ code: 'eager-split:needers' })
    expect(byName.shared!.message).toContain('`component`, `errorComponent`')
    expect(byName.registry).toMatchObject({ code: 'eager-split:written' })
    expect(byName.registry!.message).toContain(
      `(line ${lineOf(code, 'registry.add')})`,
    )
    expect(byName.snapshot).toMatchObject({ code: 'eager-split:state' })
    expect(byName.snapshot!.message).toContain('reads `n`')
    // `client` stays only because `api`, which stays, reads it: one
    // warning, at the cause
    expect(byName.api).toMatchObject({ code: 'eager-split:reads' })
    expect(byName.api!.message).toContain(
      'reads `client` when the module loads, and `client` has side effects',
    )
    for (const [name, d] of Object.entries(byName)) {
      expect(d.range, name).toMatchObject({
        start: code.indexOf(`${name} = `),
      })
    }
  })

  it('reports a reader of mutable state several split options need as such', async () => {
    const r = await kept(
      dedent(`
        import { createFileRoute } from 'toy-router'
        let n = 0
        const snapshot = [n]
        export function inc() { n++ }
        export const Route = createFileRoute('/')({
          component: () => snapshot,
          errorComponent: () => snapshot,
        })
      `),
      ['component', 'errorComponent'],
    )
    expect(r.diagnostics).toMatchObject([{ code: 'eager-split:state' }])
    expect(r.diagnostics[0]!.message).toContain('`snapshot`')
    expect(r.diagnostics[0]!.message).not.toContain('side effects')
  })

  it('moves an effectful declaration a bare import follows (module loading is hoisted: no effect stays after it)', async () => {
    const r = await kept(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import JSConfetti from 'js-confetti'
        const confetti = new JSConfetti()
        import './side.css'
        export const Route = createFileRoute('/')({
          component: () => confetti.addConfetti(),
        })
      `),
    )
    expect(r.env).toContain("import './side.css'")
    expect(r.env).not.toContain('new JSConfetti()')
    expect(r.diagnostics).toEqual([])
  })

  it('reports the same in dev', async () => {
    const r = await kept(pinned, ['component'], envInfo({ mode: 'dev' }))
    expect(r.diagnostics).toMatchObject([{ code: 'eager-split:order' }])
  })

  it('does not report what the route module itself reads', async () => {
    const r = await kept(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { make, log } from './lib'
        const client = make()
        log(client)
        export const Route = createFileRoute('/')({ component: () => client })
      `),
    )
    expect(r.env).toContain('const client = make()')
    expect(r.diagnostics).toEqual([])
  })
})

// A call of a known package's pure export (`RecognizerTable.pureCalls`)
// with pure arguments is pure, recognised by import binding to the package's
// export (renamed, namespace member).
describe('pure calls of known packages', () => {
  const recognizer = {
    ...EMPTY_RECOGNIZER,
    pureCalls: { 'toy-router': new Set(['getRouteApi']) },
  }
  async function compile(code: string, files: Record<string, string> = {}) {
    const host = new MemoryHost({
      files: { '/app/route.tsx': code, ...files },
      recognizer,
    })
    const planners = [toySplitPlanner({ keys: ['component'] })]
    const env = envInfo({ mode: 'build' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      { env },
    )
    return {
      env: main?.code ?? '',
      chunk: chunk?.code ?? '',
      kept: (main?.diagnostics ?? [])
        .filter((d) => d.code?.startsWith('eager-'))
        .map((d) => /`(\w+)` in "/.exec(d.message)![1]!),
    }
  }
  // tamery: `validateSearch: type({…})` stays and runs after both
  const tamery = (imports: string, api: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      ${imports}
      import { type } from 'arktype'
      import JSConfetti from 'js-confetti'
      const confetti = new JSConfetti()
      const { useParams } = ${api}
      export const Route = createFileRoute('/')({
        validateSearch: type({ 'a?': 'string' }),
        component: () => [confetti, useParams()],
      })
    `)
  // the route module keeps the API (its loader reads it) after `confetti`
  const shared = (imports: string, api: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      ${imports}
      import JSConfetti from 'js-confetti'
      const confetti = new JSConfetti()
      const routeApi = ${api}
      export const Route = createFileRoute('/')({
        loader: () => routeApi.id,
        component: () => [confetti, routeApi.useParams()],
      })
    `)
  const direct = [
    ["import { getRouteApi } from 'toy-router'", "getRouteApi('/x')"],
    ["import { getRouteApi as g } from 'toy-router'", "g('/x')"],
    ["import * as R from 'toy-router'", "R.getRouteApi('/x')"],
  ] as const

  it('moves a declaration calling one into the chunk: only an effect before it stays', async () => {
    for (const [imports, api] of direct) {
      const r = await compile(tamery(imports, api))
      expect(r.env, api).not.toContain(api)
      expect(r.chunk, api).toContain(`const { useParams } = ${api}`)
      expect(r.env, api).toContain('const confetti = new JSConfetti()')
      expect(r.kept, api).toEqual(['confetti'])
    }
  })

  it('pins no earlier effect where the route module keeps it', async () => {
    for (const [imports, api] of direct) {
      const r = await compile(shared(imports, api))
      expect(r.env, api).toContain(`const routeApi = ${api}`)
      expect(r.env, api).not.toContain('new JSConfetti')
      expect(r.chunk, api).toContain('const confetti = new JSConfetti()')
      expect(r.kept, api).toEqual([])
    }
  })

  it('keeps a call with an impure argument or of another export an effect', async () => {
    for (const [imports, api, files] of [
      [
        "import { getRouteApi } from 'toy-router'\nimport { id } from './lib'",
        'getRouteApi(id())',
        { '/app/lib.ts': "export const id = () => '/x'" },
      ],
      ["import { useRouteApi } from 'toy-router'", "useRouteApi('/x')", {}],
      [
        "import { getRouteApi } from './lib'",
        "getRouteApi('/x')",
        { '/app/lib.ts': 'export function getRouteApi(id) { return { id } }' },
      ],
    ] as const) {
      const r = await compile(tamery(imports, api), files)
      expect(r.env, api).toContain(`const { useParams } = ${api}`)
      expect(r.kept, api).toEqual(['confetti', 'useParams'])
      expect((await compile(shared(imports, api), files)).kept, api).toEqual([
        'confetti',
      ])
    }
  })
})
