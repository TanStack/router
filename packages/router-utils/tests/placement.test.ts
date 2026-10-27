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
import type { Planner, SymbolId } from '../src/compiler'

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
    const planners = [toySplitPlanner(), rename]
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

describe('extracted-export outputs', () => {
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

  it('moves an effectful declaration two chunks reach only through an extracted export into that output', async () => {
    // before extraction both chunks reach `theme` through `Card` (R29 (a)
    // fails); the chunks import `Card` from its output, which alone needs
    // `theme`: decided over the final placement, `theme` moves with it
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
    expect(r.env).not.toContain('createTheme')
    expect(r.env).toContain(
      "export { Card } from './route.tsx?tsr-split=export~Card'",
    )
    const e = await r.extracted('Card')
    expect(e?.code).toContain("import { createTheme } from './theme'")
    expect(e?.code).toContain('const theme = createTheme()')
    expect(e?.code).toContain('function Card() { return theme.card }')
    // the output holds an effect now: not flagged side-effect free
    expect(e?.sideEffectFree).toBe(false)
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

  it('moves an initialiser whose import the route module also reads (R64)', async () => {
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

  it('moves an initialiser reading a const the route module keeps (R67)', async () => {
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
    'keeps an initialiser reading a kept binding that is %s eager (R67)',
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

  it('keeps an initialiser reading a kept const eager when a later effect stays (R67)', async () => {
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

  it('keeps a cluster eager when an effect follows its first effectful item (R65)', async () => {
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
    const env = envInfo({ name: 'ssr', type: 'server', routerSplit: false })
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
    const env = envInfo({ name: 'rsc', type: 'server', routerSplit: false })
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
