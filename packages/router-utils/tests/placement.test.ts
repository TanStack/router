import { describe, expect, it } from 'vitest'
import { EMPTY_RECOGNIZER } from '../src/compiler'
import {
  MemoryHost,
  compileLog,
  dedent,
  envInfo,
  findRouteOptions,
  propertyOf,
  toyEnvPlanner,
  toyHydratePlanner,
  toySplitPlanner,
} from './helpers'
import type {
  EnvInfo,
  Planner,
  RecognizerTable,
  SymbolId,
} from '../src/compiler'

// every compile of this file is logged: the last test reads their reports
compileLog.enabled = true

async function split(
  code: string,
  opts: {
    keys?: Array<string>
    groups?: Array<Array<string>>
    env?: 'client' | 'server'
    identifierEdits?: boolean
    imported?: Array<string>
    files?: Record<string, string>
    mode?: 'build' | 'dev'
  } = {},
) {
  const host = new MemoryHost({
    files: { '/app/route.tsx': code, ...opts.files },
  })
  const planners = [
    toyEnvPlanner(),
    toySplitPlanner({
      keys: opts.keys,
      groups: opts.groups,
      identifierEdits: opts.identifierEdits,
      imported: opts.imported,
    }),
  ]
  const env = envInfo({
    ...(opts.env === 'server' && { name: 'ssr', type: 'server' }),
    ...(opts.mode !== undefined && { mode: opts.mode }),
  })
  const main = await host.compile('/app/route.tsx', planners, { env })
  const chunks: Record<string, string> = {}
  const chunkKeys = new Set(
    (opts.keys ?? ['component']).map(
      (key) => opts.groups?.find((g) => g.includes(key))?.join('---') ?? key,
    ),
  )
  for (const key of chunkKeys) {
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

describe('clusters and the write table', () => {
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
    'moves a module binding the sole group only %s into its chunk (a write needs the binding)',
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
    const r = await split(code, { imported: ['count'] })
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      notSplittable: 'component',
    })
    expect(r.env).toContain('component: () => { count++; return count }')
    expect(r.chunks.component).toBe('export {}\n')
  })

  // the copy analogue between chunks: the reader's chunk would hold its own
  // copy, which the writer's never assigns
  it.each([
    [
      'the loader writes',
      'loader: () => count++,',
      'component: () => count,',
      'loader',
    ],
    [
      'the component writes',
      'loader: () => count,',
      'component: () => { count++; return count },',
      'component',
    ],
  ])(
    'falls back when another chunk copies the binding a chunk writes: %s (shared-writer)',
    async (_, loader, component, writer) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let count = 0
        export const Route = createFileRoute('/')({
          ${loader}
          ${component}
        })
      `)
      const r = await split(code, { keys: ['loader', 'component'] })
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        reasons: { [writer]: true },
      })
      expect(r.env).toContain(writer === 'loader' ? loader : component)
    },
  )

  // spec-phase2-hydrate H1, H2, H4 on the core: a `<Hydrate>` chunk copies
  // the declarations its children reach and no statement; it imports what
  // its planner names (`imported`); one assigning such an import falls back
  describe('a <Hydrate> chunk', () => {
    const buildEnv = { env: envInfo({ mode: 'build' }) }
    const source = (children: string) =>
      dedent(`
      import { Hydrate } from 'toy-start'
      import { register } from './register'
      export let theme = { c: 1 }
      register(theme)
      export function Page() { return <Hydrate>${children}</Hydrate> }
    `)
    const reads = '<p>{theme.c}</p>'
    const assigns = '<p onClick={() => { theme = { c: 2 } }}>{theme.c}</p>'
    const compileBoth = async (code: string, imported?: Array<string>) => {
      const host = new MemoryHost({ files: { '/app/mod.tsx': code } })
      const planners = [toyHydratePlanner('toy-start', { imported })]
      const env = await host.compile('/app/mod.tsx', planners, buildEnv)
      const h = await host.compile(
        '/app/mod.tsx?tss-hydrate=h0',
        planners,
        buildEnv,
      )
      return { env: env!, chunk: h!.code }
    }

    it('copies the declarations the children reach, without the statements reaching them (H1)', async () => {
      const r = await compileBoth(source(reads))
      expect(r.env.facts.planners['toy-hydrate']).toBeUndefined()
      expect(r.chunk).toContain('let theme = { c: 1 }')
      expect(r.chunk).not.toContain('register')
      expect(r.chunk).not.toContain("from '/app/mod.tsx'")
      expect(r.env.code).toContain(
        'export let theme = { c: 1 }\nregister(theme)',
      )
    })

    it('imports a binding its planner names (H2)', async () => {
      const r = await compileBoth(source(reads), ['theme'])
      expect(r.chunk).toContain("import { theme } from '/app/mod.tsx'")
      expect(r.chunk).not.toContain('let theme')
    })

    // H4: assigning an import, or the chunk's copy of a binding the env
    // module keeps (the copy would be written, the env module's read)
    it.each([
      ['an import', ['theme']],
      ['its copy of a binding the module keeps', undefined],
    ])('falls back when the children assign %s (H4)', async (_, imported) => {
      const r = await compileBoth(source(assigns), imported)
      expect(r.env.facts.planners['toy-hydrate']).toEqual({
        kept: { h0: true },
      })
      expect(r.env.code).not.toContain('tss-hydrate')
    })
  })

  // the same fallback for a component declared on its own: the route module
  // keeps the binding for its other reader, so the chunk would assign a
  // binding it imports
  it.each([
    [
      'updates a binding the loader reads',
      'let count = 0\nfunction Page() { count++; return count }',
      'loader: () => count,',
    ],
    [
      'assigns a binding beforeLoad reads',
      "let last: string | undefined\nfunction Page() { last = 'seen'; return 'a' }",
      'beforeLoad: () => ({ last }),',
    ],
  ])(
    'falls back for a declared component that %s (shared-writer)',
    async (_, decl, option) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        ${decl.split('\n').join('\n        ')}
        export const Route = createFileRoute('/')({
          ${option}
          component: Page,
        })
      `)
      const r = await split(code, { imported: ['count', 'last'] })
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: true },
      })
      expect(r.env).toContain('component: Page,')
      expect(r.env).toContain('function Page()')
    },
  )

  it('falls back for a declared component writing a binding the route module only writes', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let count = 0
      function Page() { count++; return 'page' }
      export const Route = createFileRoute('/')({
        loader: () => { count = 0; return 'data' },
        component: Page,
      })
    `)
    const r = await split(code, { imported: ['count'] })
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { component: true },
    })
  })

  it('moves a binding two options of one chunk write into that chunk', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let renders = 0
      export const Route = createFileRoute('/')({
        component: () => { renders++; return renders },
        pendingComponent: () => { renders++; return renders },
      })
    `)
    const r = await split(code, {
      keys: ['component', 'pendingComponent'],
      groups: [['component', 'pendingComponent']],
    })
    expect(r.main?.facts.planners['toy-split']).toBeUndefined()
    expect(r.env).not.toContain('let renders')
    const chunk = r.chunks['component---pendingComponent']!
    expect(chunk).toContain('let renders = 0')
    expect(chunk.match(/renders\+\+/g)).toHaveLength(2)
  })

  it('moves a declared component with the binding only it writes and reads', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let count = 0
      function Page() { count++; return count }
      export const Route = createFileRoute('/')({
        loader: () => 'data',
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.main?.facts.planners['toy-split']).toBeUndefined()
    expect(r.env).not.toContain('let count')
    expect(r.chunks.component).toContain('let count = 0')
    expect(r.chunks.component).toContain('function Page()')
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
          ctx.renameRefs(sym, { sym: next.sym }, 'toy-rename')
        }
      },
    }
    const planners = [rename, toySplitPlanner({ imported: ['page'] })]
    const main = await host.compile('/app/route.tsx', planners)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
    )
    expect(main?.code).toContain('const TsrPendingComponent = ')
    expect(main?.code).not.toContain('page')
    expect(main?.code).toContain('export { TsrPendingComponent }')
    expect(chunk?.code).toContain(
      "import { TsrPendingComponent } from '/app/route.tsx'",
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
        ctx.renameRefs(unit.declares[0]!, { sym: next.sym }, 'toy-rename')
      },
    }
    const planners = [rename, toySplitPlanner({ imported: ['page'] })]
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
        ctx.renameRefs(unit.declares[0]!, { sym: next.sym }, 'toy-rename')
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
        ctx.renameRefs(sym, { sym: next.sym }, 'toy-rename')
      },
    }
    const planners = [rename, toySplitPlanner({ imported: ['render'] })]
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
      "import { TsrPendingComponent } from '/app/route.tsx'",
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
        ctx.rewrites.placeholder({
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

describe('exported declarations a chunk reads', () => {
  // exported declarations a chunk needs: the route module keeps them, a
  // chunk copies or imports them (a build)
  const build = { env: envInfo({ mode: 'build' }) }
  async function extract(code: string, keys = ['component']) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ keys })]
    const out = await host.compile('/app/route.tsx', planners, build)
    const env = out?.code ?? ''
    const chunk =
      (
        await host.compile(
          '/app/route.tsx?tsr-split=component',
          planners,
          build,
        )
      )?.code ?? ''
    return { host, env, chunk }
  }

  // `export default count` holds the value `count` has when it runs: of a
  // reassigned `count` it is no re-export of the binding, and no name a
  // chunk can import the binding by.
  it('keeps `export default x` of a reassigned `x` in the env module beside an exported function writing it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let count = 0
      export function bump() { count++; return count }
      export default count
      export const Route = createFileRoute('/')({ component: () => bump() })
    `)
    const r = await extract(code)
    expect(r.env).toContain('let count = 0')
    expect(r.env).toContain('export default count')
  })

  it('keeps a default export of an expression reading an exported function in the env module (it is no re-export)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function Page() { return 'page' }
      export default () => Page()
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export default () => Page()')
    expect(r.env).toContain('export function Page()')
  })

  it('keeps an import an exported function reads when erased code read it too', async () => {
    // `Page` is exported, so it stays in the env module; the client erases
    // the `wrapServer` argument, the only other reader of `fmt`, which stays
    // since `Page` still reads it by value (a `<Hydrate>` after erased server
    // code lost its import this way).
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrapServer } from 'toy-start'
      import { fmt } from './fmt'
      export const serverFn = wrapServer(() => fmt('s'))
      export function Page() { return fmt('p') }
      export const Route = createFileRoute('/')({ component: () => 1 })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toyEnvPlanner(), toySplitPlanner()]
    const env = (await host.compile('/app/route.tsx', planners))?.code ?? ''
    expect(env).toContain("import { fmt } from './fmt'")
    expect(env).toContain('export const serverFn = tsrStub()')
    expect(env).toContain("export function Page() { return fmt('p') }")
  })

  // An export stays in the env module, and so does what it reads by value.
  it('keeps two exports reading one declaration, and that declaration, in the env module', async () => {
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
  })

  it('moves a declaration only the chunk and erased code read, and keeps the export beside it', async () => {
    // `store` is only read by the chunk and by code the env planner erases:
    // it moves; the env module keeps `Shared` for the export `Page`
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
    const planners = [toyEnvPlanner(), toySplitPlanner({ keys: ['component'] })]
    const env = (await host.compile('/app/route.tsx', planners))?.code ?? ''
    expect(env).not.toContain('const store = see(Shared)')
    expect(env).toContain('export const Page = Shared')
  })

  // A chunk copies a declaration the env module keeps and does not export;
  // a provider output takes an import only it reads.
  describe('what a chunk and a provider output take', () => {
    /** A provider output whose generated wrapper reads the exported `fn` (the shape of the J4.14 tests). */
    const toyProviderPlanner = (): Planner => ({
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
        // (unexported: found through a read of it)
        const sym = (
          fn?.kind === 'local'
            ? fn.local
            : ctx.t1.refs.all.find((r) => ctx.symbols.name(r.sym) === 'fn')?.sym
        ) as never
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
    })
    /** The handler leaves the env module for the provider output (Start's `providerOut`): a placeholder argument in the env module, the body in the provider. */
    const providerOutEnvPlanner = (): Planner => ({
      name: 'toy-env-provider-out',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const { analysis, t1 } = ctx
        const imp = analysis.imports.find((i) => i.specifier === 'toy-start')!
        for (const sp of imp.specifiers) {
          for (const ref of t1.refs.refsOf(sp.local)) {
            const node = t1.nodeAt(ref.range.start)
            const call = node ? t1.parentOf(node) : null
            const arg =
              call?.type === 'CallExpression' ? call.arguments[0] : undefined
            if (arg) {
              ctx.rewrites.placeholder({
                range: { start: arg.start, end: arg.end },
                body: [{ k: 'text', parts: ['0'] }],
                scope: ['env'],
                by: 'toy-env-provider-out',
              })
            }
          }
        }
      },
    })

    it('copies a constant the env module keeps into the chunk, a member write of it notwithstanding (no assignment of the binding)', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const N = 1
        function Page() { (N as any).x = 2; return N }
        export const Route = createFileRoute('/')({
          loader: () => N,
          component: Page,
          errorComponent: () => N,
        })
      `)
      const r = await extract(code, ['component', 'errorComponent'])
      expect(r.env).toContain('const N = 1')
      expect(r.chunk).toContain('const N = 1')
      expect(r.chunk).not.toContain("from '/app/route.tsx'")
    })

    // An import only a server fn's handler reads is orphaned in the env
    // module (the handler is a stub there) and needed by the provider output
    // alone: it goes with the provider, not nowhere (the Start planner tests
    // caught a placement change that dropped it).
    it('keeps an import only a provider output needs for the provider', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { wrapServer } from 'toy-start'
        import { db } from './db'
        export const fn = wrapServer(() => db.q())
        export const Route = createFileRoute('/')({ component: () => 1 })
      `)
      const host = new MemoryHost({ files: { '/app/route.tsx': code } })
      const planners = [
        providerOutEnvPlanner(),
        toyProviderPlanner(),
        toySplitPlanner({ keys: ['component'] }),
      ]
      const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
      const main = await host.compile('/app/route.tsx', planners, { env })
      expect(main?.code).toContain('export const fn = wrapServer(0)')
      expect(main?.code).not.toContain("from './db'")
      const prov = await host.compile(
        '/app/route.tsx?tss-serverfn-split',
        planners,
        { env },
      )
      expect(prov?.code).toContain("import { db } from './db'")
      expect(prov?.code).toContain('() => db.q()')
    })
  })

  // the executing property (toy planner, seeds 2578, 7394, 9413, 9430): a
  // route option value writes an export at load; the export stays in the
  // route module, as every export does, with the route
  it('keeps an export a route option value writes in the route module with the route', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const o0 = { v: 1 }
      export const Route = createFileRoute('/')({
        loader: (Object.assign(o0, { v: 15 }), () => ({})),
        component: () => o0,
      })
    `)
    const r = await extract(code, ['component', 'loader'])
    expect(r.env).toContain('export const Route = createFileRoute(')
    expect(r.env).toContain('export const o0 = { v: 1 }')
  })

  it('keeps an exported function and the statement augmenting it in the env module', async () => {
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

  it('gets a `;` when a chunk copies it after another statement', async () => {
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

describe('a statement that ends without a `;`', () => {
  const route = `export const Route = createFileRoute('/')({ component: Page })`
  const head = `import { createFileRoute } from 'toy-router'\n`

  it.each([
    ['nothing', `const Page = () => 1`],
    ['a line comment', `const Page = () => 1 // done`],
    ['a block comment', `const Page = () => 1 /* done */`],
  ])(
    'ends the file with %s: the chunk export is a statement',
    async (_, end) => {
      const r = await split(`${head}${route}\n${end}`)
      expect(r.chunks.component).toContain(`${end}\n`)
    },
  )

  it('gets a line end where a comment held its line break, which stays with what it leads', async () => {
    const r = await split(
      `${head}import { see } from './see'\nconst Page = () => 1 /* a\nb */ /* @__PURE__ */ see('env')\n${route}\n`,
    )
    expect(r.chunks.component).toContain(`const Page = () => 1 \n`)
    expect(r.chunks.component).not.toContain('/* a')
    expect(r.env).toContain(`/* a\nb */ /* @__PURE__ */ see('env')`)
  })

  it('stays a statement when what the comment leads goes', async () => {
    const r = await split(
      `${head}import { see } from './see'\nsee('kept') /* a\nb */ const Page = () => 1\nsee('next')\n${route}\n`,
    )
    expect(r.env).toContain(`see('kept') \nsee('next')`)
  })

  it('starts the next statement on its own line after a license comment holding its line break', async () => {
    const r = await split(
      `${head}const a = 1 /*! a\nb */ const Page = () => a\n${route}\n`,
    )
    expect(r.chunks.component).not.toContain('/*!')
    expect(r.chunks.component).toContain(`const a = 1 \nconst Page = () => a`)
  })
})

describe('a `var` declared again', () => {
  const route = (name: string) =>
    `export const Route = createFileRoute('/')({ component: ${name} })\n`
  const head = `import { createFileRoute } from 'toy-router'\n`

  it('is no write when the first declaration of a value follows a type of its name', async () => {
    const r = await split(
      `${head}type Page = { a: 1 }\nconst Page = () => 1\n${route('Page')}`,
    )
    expect(r.main?.diagnostics).toEqual([])
    expect(r.chunks.component).toContain('const Page = () => 1')
    expect(r.env).not.toContain('const Page')
  })

  it('is no write of the module binding in a catch clause with a parameter of its name', async () => {
    const r = await split(
      `${head}var Page = () => 1\ntry {} catch (Page) { var Page = 2 }\n${route('Page')}`,
    )
    expect(r.chunks.component).toContain('var Page = () => 1')
  })
})

describe('route-module specifics (lane router)', () => {
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

  // R148: an unused function reading only imports stays in the route module
  it('keeps an unused function reading imports two chunks use', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { Button } from './ui'
      function Page() { return Button() }
      function Other() { return Button() }
      function Unused() { return Button() + 1 }
      export const Route = createFileRoute('/')({ component: Page, errorComponent: Other })
    `)
    const r = await split(code, { keys: ['component', 'errorComponent'] })
    expect(r.env).toContain('function Unused() { return Button() + 1 }')
  })

  // code already unused stays where it was written, whatever its
  // initialiser calls (the dead-code page: a namespace calling `track`)
  it('keeps an unused declaration calling an import in the env module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      namespace Unused { export const value = track('namespace') }
      export const Route = createFileRoute('/')({ component: () => track('component') })
    `)
    const r = await split(code)
    expect(r.env).toContain(
      "namespace Unused { export const value = track('namespace') }",
    )
    expect(r.chunks.component).not.toContain('namespace')
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
    expect(r.chunks.component).toContain(
      "import { value } from '/app/route.tsx'",
    )
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

  // Source: tanstack.com `ds.typography.tsx`: `import type * as React from
  // 'react'` and JSX in the split component gave the chunk `import { React }`
  // from the route module, which exported a type-only binding (Rolldown:
  // MISSING_EXPORT). A binding without a runtime value is never the factory.
  it.each([
    ['a type-only namespace import', "import type * as React from 'react'"],
    ['a type-only default import', "import type React from 'react'"],
    ['a type-only named import', "import type { React } from 'react'"],
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

describe('generated units after the imports of a derived output', () => {
  it('render after the last included import, before the statement it ends at', async () => {
    const code = dedent(`
      const before = 'B'
      import { x } from './x'
      const after = 'A'
      export const read = () => [before, x, after]
    `)
    const host = new MemoryHost({
      files: { '/app/m.ts': code, '/app/x.ts': 'export const x = 1\n' },
    })
    const planner: Planner = {
      name: 'toy-derived',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const out = ctx.declareOutput({
          kind: 'provider',
          key: 'provider',
          derived: { kind: 'provider', value: '' },
        })
        const read = ctx.t1.units.find((u) => u.exported.includes('read'))!
        ctx.addRoot(out, { t: 'unit', id: read.id })
        ctx.rewrites.addGenerated({
          body: [{ k: 'text', parts: ['const generated = 1\n'] }],
          declares: [],
          effectful: false,
          anchor: { k: 'after-header' },
          home: out,
          by: 'toy-derived',
        })
      },
    }
    const env = envInfo({ name: 'rsc', type: 'server' })
    const out = await host.compile('/app/m.ts?tss-serverfn-split', [planner], {
      env,
    })
    const at = (text: string) => out!.code.indexOf(text)
    expect(at("from './x'")).toBeGreaterThan(-1)
    expect(at('const generated')).toBeGreaterThan(at("from './x'"))
    expect(at("const after = 'A'")).toBeGreaterThan(at('const generated'))
  })
})

describe('provenance-based orphans', () => {
  it('keeps a self-referencing declaration already unused in the source', async () => {
    const code = ROUTE(
      '  component: () => null,',
      'const b = register(() => b)',
    )
    const r = await split(code)
    expect(r.env).toContain('const b = register(() => b)')
  })

  it('removes declarations orphaned by an erased handler with their initialisers (J4.11)', async () => {
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

describe('a declaration only a chunk reads moves with its initialiser', () => {
  it('moves a call initialiser only the chunk reads', async () => {
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

  it('splits a component reading an exported class without diagnostics', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export class Service { constructor(readonly dep: unknown) {} }
      export const Route = createFileRoute('/')({
        component: () => new Service(1),
      })
    `)
    const r = await split(code)
    expect(r.main?.diagnostics).toEqual([])
  })

  it('moves consecutive call initialisers one chunk reads together, in source order', async () => {
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

  it('moves a /* @__PURE__ */ initialiser like any other', async () => {
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
})

describe('names, imports and type units', () => {
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
      "const tsrImportComponent$1 = () => import('/app/route.tsx?tsr-split=component')",
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
    expect(host.edgesOf(out!).map((e) => e.specifier)).not.toContain('./labels')
  })
})

// Type-only export syntax has no runtime meaning: no output keeps it, as
// main's `stripTypeExports` removed it. Its binding may be an inline type
// specifier that left with its statement's values, and a Babel plugin after
// the compiler (React Compiler) rejects an export nothing declares ("Export
// 'Row' is not defined"; corpus of #8817: brain-dump `claude-tasks.ts`).
// Type declarations stay as written.
describe('type-only exports', () => {
  const rows = dedent(`
    export const readRows = () => [1]
    export const label = 'label'
    export type Row = { id: number }
  `)
  const exportForms = dedent(`
    export type { Row }
    export { type Row as R2, label }
    export type { Row as R3 } from './rows'
    export { type Row as R4 } from './rows'
    export { label as L2, type Row as R5 } from './rows'
    export type * from './rows'
  `)

  it('leaves them out of an env module whose erasure removed their inline type import', async () => {
    const host = new MemoryHost({
      files: {
        '/app/rows.ts': rows,
        '/app/lib.ts': dedent(`
          import { wrapServer } from 'toy-start'
          import { readRows, type Row } from './rows'
          import { label } from './rows'
          ${exportForms}
          export type Local = Row
          export interface Shape { row: Row }
          export const fn = wrapServer(() => readRows())
        `),
      },
    })
    const out = await host.compile('/app/lib.ts', [toyEnvPlanner()])
    const code = out?.code ?? ''
    expect(code).not.toContain('readRows')
    expect(code).not.toMatch(/\bR[2-5]\b|export type \{|export type \*/)
    expect(code).toContain('export { label }')
    expect(code).toContain("export { label as L2 } from './rows'")
    expect(code).toContain('export type Local = Row')
    expect(code).toContain('export interface Shape { row: Row }')
  })

  it('leaves them out of a route module whose split moved their inline type import', async () => {
    const r = await split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { readRows, type Row } from './rows'
        import { label } from './rows'
        ${exportForms}
        export const Route = createFileRoute('/')({
          component: (): Array<Row> => readRows(),
        })
      `),
      { files: { '/app/rows.ts': rows } },
    )
    for (const code of [r.env, r.chunks.component!]) {
      expect(code).not.toMatch(/\bR[2-5]\b|export type \{|export type \*/)
    }
    expect(r.env).toContain('export { label }')
    expect(r.env).toContain("export { label as L2 } from './rows'")
    expect(r.chunks.component).toContain('readRows')
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
              },
            },
          ],
        })
        const hoisted = ctx.names.alloc('tsrServerFn')
        const owner = ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: [`const ${hoisted.name} = `] },
            { k: 'region', id: ctx.region(range, 'nested-chain') },
            { k: 'text', parts: ['\n'] },
          ],
          declares: [hoisted.sym],
          effectful: false,
          anchor: { k: 'after-header' },
          home: out,
          by: 'toy-provider',
        })
        // the env module keeps the chain in place, with its stub
        ctx.rewrites.claim({
          region: ctx.region(range, 'nested-chain'),
          owner,
          placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
          scope: { except: ['env'] },
          by: 'toy-provider',
        })
        ctx.rewrites.placeholder({
          range: { start: hStart, end: hStart + handler.length },
          body: [{ k: 'text', parts: [{ sym: stub.sym }, "('id')"] }],
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
  it('keeps a dead cycle of functions like a dead self-recursive function', async () => {
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

describe('declarations reading state the module writes', () => {
  it.each([
    [
      'the write ran before it',
      'const obj = { v: 0 }\nobj.v = 5\nfunction read() { return obj.v }\nconst snap = /* @__PURE__ */ read()',
      'obj.v',
    ],
    [
      'a synchronous IIFE wrote it',
      'const state = { v: 0 }\n;(() => { state.v = 5 })()\nfunction read() { return state.v }\nconst snap = read()',
      'state.v',
    ],
    [
      'a static field wrote it',
      'const counter = { n: 0 }\nclass Item { static id = counter.n++ }\nfunction read() { return counter.n }\nconst snap = read()',
      'Item.id',
    ],
  ])(
    'moves a value computed at load to the chunk when %s',
    async (_, declarations, loaderReads) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        ${declarations.replaceAll('\n', '\n        ')}
        export const Route = createFileRoute('/')({
          loader: () => ${loaderReads},
          component: () => snap,
        })
      `)
      const r = await split(code)
      expect(r.env).not.toMatch(/const snap = /)
      expect(r.chunks.component).toMatch(/const snap = /)
    },
  )

  it.each([
    ['bound, not called', 'const initial = (() => n).bind(null)', false],
    // without semicolons, a line starting with `(` after an arrow's block
    // is a statement of its own: the arrow is not called
    [
      'followed by a statement in parentheses',
      'const read = () => {\n  return n\n}\n(globalThis as any).seen = 1\nconst initial = read',
      false,
    ],
    ['held, not called', 'const initial = { read: () => n }', false],
    [
      'a method of an object passed to a call',
      'const initial = wrap({ setup() { return n } })',
      false,
    ],
    [
      'augmented by a statement that calls something',
      'function read() { return n }\nread.label = wrap(() => 1)\nconst initial = read',
      false,
    ],
  ])(
    'moves a declaration holding a function that is %s with the component (in the route module: %s)',
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
      // `eager`: the declaration stays in the route module; otherwise it
      // moves with the component
      const initial = declaration.slice(declaration.lastIndexOf('\n') + 1)
      expect(r.env.includes(initial)).toBe(eager)
      expect((r.chunks.component ?? '').includes(initial)).toBe(!eager)
    },
  )

  // a top-level statement stays in the route module (R154), whatever its
  // callback reads
  it.each([
    [
      'an assignment of a call',
      'seen = wrap(() => n)()',
      'seen = wrap(() => n)()',
    ],
  ])(
    'keeps %s at the top level in the route module',
    async (_, statement, stays) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { wrap } from './state'
        const cond = true
        let n = 0
        let seen = 0
        export function inc() { n++ }
        ${statement}
        const initial = [seen]
        export const Route = createFileRoute('/')({
          component: () => initial,
        })
      `)
      const r = await split(code, {
        files: {
          '/app/state.ts': 'export const wrap = (f: () => number) => f\n',
        },
      })
      expect(r.env).toContain(stays)
    },
  )

  it.each([
    ['reads nothing written', 'function wrap(C) { return () => C() }', true],
  ])(
    'splits an option value calling a module helper that %s',
    async (_, helper, splits) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let n = 0
        export function inc() { n++ }
        ${helper}
        function Page() { return 'x' }
        export const Route = createFileRoute('/')({ component: wrap(Page) })
      `)
      const r = await split(code)
      expect(r.env.includes('component: wrap(Page)')).toBe(!splits)
    },
  )

  it('moves a component reading a `let` an exported function assigns', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 0
      export function inc() { n++ }
      function Page() { return n }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('function Page()')
    expect(r.chunks.component).toContain('function Page() { return n }')
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

// What a function a declaration or an option value holds, passes to a call
// or calls at load does decides nothing: placement reads names, references
// and assignments. Source: review of 2026-11-10, F1 (F1-1,
// F1-2, F1-3a, F1-5a, Q2).
describe('functions held, passed or called at load', () => {
  const files = {
    '/app/lib.ts':
      'export const open = () => ({})\nexport const wrap = (x: unknown) => x\nexport const define = (x: unknown) => x\nexport const f = (x: unknown) => x\n',
  }
  async function compile(
    code: string,
    planners: Array<Planner> = [toySplitPlanner()],
    env: EnvInfo = envInfo({ mode: 'build' }),
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code, ...files } })
    const main = await host.compile('/app/route.tsx', planners, { env })
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      { env },
    )
    return {
      main,
      env: main?.code ?? '',
      chunk: chunk?.code ?? '',
    }
  }

  // F1-5a: a holder of a function moves with the chunk reading it, whoever
  // else calls the function at load
  it('moves a holder of a function another declaration calls at load with the chunk', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrap } from './lib'
      let cache
      function getCached() { return (cache ??= wrap({})) }
      const warm = getCached()
      const api = { getCached }
      export const Route = createFileRoute('/')({
        loader: () => warm,
        component: () => api,
      })
    `)
    const r = await compile(code)
    expect(r.env).toContain('const warm = getCached()')
    expect(r.env).not.toContain('const api')
    expect(r.chunk).toContain('const api = { getCached }')
  })

  // F1-3a: an option value passing a method to a call splits, written
  // inline or as a const
  it.each([
    [
      'written inline',
      'let client\nfunction getClient() { return (client ??= {}) }',
      'define({ setup() { return getClient() } })',
    ],
    [
      'a const',
      'let client\nfunction getClient() { return (client ??= {}) }\nconst Page = define({ setup() { return getClient() } })',
      'Page',
    ],
  ])(
    'splits an option value passing a method that calls a module function to a call, %s',
    async (_, declarations, value) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { define } from './lib'
        ${declarations.replaceAll('\n', '\n        ')}
        export const Route = createFileRoute('/')({
          loader: () => getClient(),
          component: ${value},
        })
      `)
      const r = await compile(code)
      expect(r.main?.facts.planners['toy-split']).toBeUndefined()
      expect(r.env).not.toContain('define({')
      expect(r.chunk).toContain('define({ setup() { return getClient() } })')
    },
  )

  // a custom region in an exported declaration's call argument (a server
  // fn's handler) falls back for nothing
  it.each([['a function passed to a call', '() => String(n)', false]])(
    'reports no fallback for a custom region that is %s',
    async (_, argument, reason) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { f } from './lib'
        let n = 0
        export function inc() { n++ }
        export const job = f(${argument})
        export const Route = createFileRoute('/')({ component: () => null })
      `)
      const region: Planner = {
        name: 'toy-region',
        tier: 1,
        gate: () => true,
        plan(ctx) {
          const start = ctx.analysis.source.code.indexOf(argument)
          const range = { start, end: start + argument.length }
          ctx.region(range, 'custom')
          ctx.setFacts('toy-region', {
            fallback: ctx.fallbackAt(range) !== undefined,
          })
        },
      }
      const r = await compile(code, [toySplitPlanner(), region])
      expect(r.main?.facts.planners['toy-region']).toEqual({
        fallback: reason,
      })
    },
  )

  // F1-2: an exported snapshot of state a function writes stays in the
  // route module, as every export does, in a build as in dev
  const snapshot = dedent(`
    import { createFileRoute } from 'toy-router'
    let n = 0
    export function inc() { n++ }
    export const initial = [n]
    export const Route = createFileRoute('/')({
      component: () => { inc(); return initial },
    })
  `)

  it('places an exported snapshot of written state as dev does, in a build', async () => {
    const planners = [toySplitPlanner()]
    const build = await compile(snapshot, planners, envInfo({ mode: 'build' }))
    const dev = await compile(snapshot, planners, envInfo({ mode: 'dev' }))
    expect(build.env).toBe(dev.env)
    expect(build.chunk).toBe(dev.chunk)
  })
})

// A declaration only split code reads moves with it, and an option value
// splits, whatever it or the functions it reaches write: only an
// assignment of a binding the chunk imports falls back.
describe('split code reading and writing module bindings', () => {
  const route = (decls: string, options: string, extra = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { f, track, open } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
      ${extra}
    `)
  const lib = {
    '/app/lib.ts':
      'export const f = (x: unknown) => x\nexport const track = (x: unknown) => x\nexport const open = {}\n',
  }

  it('moves a reader and its binding to the chunk, which copies the write after them', async () => {
    const r = await split(
      route(
        'const a = {}\nconst x = [a]\na.v = 1',
        'loader: () => 1,\ncomponent: () => [x, a],',
      ),
      { files: lib },
    )
    expect(r.env).not.toContain('const x')
    expect(r.chunks.component).toContain('const a = {}\nconst x = [a]\na.v = 1')
  })

  it('splits an option value that writes a member of a binding only its chunk needs', async () => {
    const r = await split(
      route(
        'const seen = []',
        "component: f(seen.push('x') && (() => seen.length)),",
      ),
      { files: lib },
    )
    expect(r.env).not.toContain('seen')
    expect(r.chunks.component).toContain('const seen = []')
    expect(r.chunks.component).toContain("seen.push('x')")
  })

  it('splits an option value that writes a member of an import only its chunk names', async () => {
    const r = await split(
      route('', 'component: f((open.page = 1, () => open.page)),'),
      { files: lib },
    )
    expect(r.env).not.toContain('open.page')
    expect(r.chunks.component).toContain('open.page = 1')
  })

  // REVIEW-design2-step4 finding 3: an option value whose call runs a
  // function writing a binding nothing else touches splits, with the
  // binding, inline or named.
  it.each([
    [
      'an assignment, inline',
      'let didInit = false',
      'component: f(function Page() { if (!didInit) { didInit = true } return null }),',
    ],
    [
      'a member write, inline',
      'const seen = { n: 0 }',
      'component: f(function Page() { seen.n++; return null }),',
    ],
    [
      'a member write in an event handler, inline',
      'const seen = { n: 0 }',
      'component: f(function Page() { return () => { seen.n++ } }),',
    ],
    [
      'a member write of an import, inline',
      '',
      'component: f(function Page() { open.count = 1; return null }),',
    ],
    [
      'a member write, named',
      'const seen = { n: 0 }\nfunction Page() { seen.n++; return null }',
      'component: f(Page),',
    ],
  ])(
    'splits an option value whose call runs a function writing a binding nothing else touches (%s)',
    async (_, decls, options) => {
      const r = await split(route(decls, options), { files: lib })
      const facts = r.main?.facts.planners['toy-split'] as
        | { notSplittable?: string }
        | undefined
      expect(facts?.notSplittable).toBeUndefined()
      expect(r.chunks.component).toContain('function Page()')
      expect(r.main?.diagnostics).toEqual([])
    },
  )

  // REVIEW-design2-final finding 5: the same for a declaration: the
  // `const` spelling moves as the option value splits.
  it.each([
    [
      'an assignment',
      'let didInit = false\nconst C = f(function Page() { if (!didInit) { didInit = true } return null })',
      'C',
    ],
    [
      'a member write',
      'const seen = { n: 0 }\nconst C = f(function Page() { seen.n++; return null })',
      'C',
    ],
    [
      'a member write in an arrow',
      'const cache = {}\nconst getIt = f(() => { cache.v = 1 })',
      'getIt',
    ],
  ])(
    'moves a declaration whose call runs its own function writing a binding nothing else touches (%s)',
    async (_, decls, name) => {
      const r = await split(route(decls, `component: () => ${name},`), {
        files: lib,
      })
      expect(r.env).not.toContain(`const ${name} =`)
      expect(r.chunks.component).toContain(`const ${name} = f(`)
      expect(r.main?.diagnostics).toEqual([])
    },
  )

  // small item 2b under R152: an option value reaching a function that
  // writes a member of a binding the loader reads splits, inline or named;
  // the route module keeps the binding
  it.each([
    [
      'inline',
      'component: f(flag ? function render() { seen.n++; return null } : Fallback),',
      '',
    ],
    [
      'named',
      'component: f(flag ? render : Fallback),',
      'function render() { seen.n++; return null }',
    ],
  ])(
    'splits an option value reaching a function that writes a binding the module reads later (%s)',
    async (_, options, decls) => {
      const r = await split(
        route(
          `const seen = { n: 0 }\nconst flag = true\nfunction Fallback() { return null }\n${decls}`,
          `loader: () => seen,\n${options}`,
        ),
        { files: lib },
      )
      const facts = r.main?.facts.planners['toy-split'] as
        | { notSplittable?: string }
        | undefined
      expect(facts?.notSplittable).toBeUndefined()
      expect(r.chunks.component).toContain('seen.n++')
      expect(r.env).toContain('const seen = { n: 0 }')
      expect(r.main?.diagnostics).toEqual([])
    },
  )
})

// REVIEW-design2-step4 findings 1 and 2: a declaration reading an object
// through an alias or a holder moves with the chunk reading it, whatever
// writes the object's members.
describe('reads through another name', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  it.each([
    [
      'after the write',
      "const cfg = { v: 'OLD' }\ncfg.v = 'NEW'\nconst alias = cfg\nconst y = alias.v",
    ],
    [
      'holding a function only',
      "const cfg = { v: 'OLD' }\nconst holder = { get: () => cfg }\nconst y = holder.get\ncfg.v = 'NEW'",
    ],
  ])('moves a read through another name %s (control)', async (_, decls) => {
    const r = await split(
      route(decls, 'loader: () => cfg,\ncomponent: () => y,'),
    )
    expect(r.env).not.toContain('const y')
    expect(r.chunks.component).toContain('const y')
  })
})

// REVIEW-design2-final finding 1: the env module keeps an export and a
// top-level statement (R154), and what that statement reads by value.
describe('aliases of an object a statement writes', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { snap, on, base, extra } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  // Source: the executing placement property, toy planner, seed 305 (the
  // design 2 closing lane: red at its base, where a moved `l4` saw
  // `{ v: 1 }` and the source gives `{ v: 7 }`)
  it('keeps an export, the alias a statement writes through and that statement in the env module', async () => {
    const r = await split(
      route(
        'const o1 = { v: 1 }\nlet l3 = o1\nexport const l4 = l3\nconst l6 = l4\nObject.assign(l6, { v: 7 })',
        'component: () => ({ l6 }),',
      ),
      { keys: ['component', 'loader'] },
    )
    expect(r.env).toContain(
      'export const l4 = l3\nconst l6 = l4\nObject.assign(l6, { v: 7 })',
    )
  })
})

// Review round 1, findings F2-1 and F2-2: a write through a local name (a
// parameter, a `for…in` variable, a function's own `const`) is no
// assignment of a module binding: a read at load before it moves with the
// component.
describe('round 1 F2-1/F2-2: writes through a local name', () => {
  const route = (write: string) =>
    [
      "import { createFileRoute } from 'toy-router'",
      "const S: any = { theme: 'light', inner: { theme: 'light' }, list: [] }",
      'const initial = S.theme',
      write,
      "export const Route = createFileRoute('/')({",
      '  beforeLoad: () => S,',
      '  component: () => initial,',
      '})',
    ].join('\n')

  it.each([
    [
      'a parameter handed a new object',
      "function set(o: any) { o.theme = 'dark' }\nset({ ...S })",
    ],
    ['a `for…in` variable', 'for (const k in S) { (k as any).length = 0 }'],
    [
      'a local object',
      "function set() { const t = { theme: S.theme }; t.theme = 'dark' }\nset()",
    ],
  ])(
    'moves a read at load before a write through %s (control)',
    async (_, write) => {
      const r = await split(route(write))
      expect(r.env).not.toContain('const initial = S.theme')
      expect(r.chunks.component).toContain('const initial = S.theme')
    },
  )
})

// Review round 1, finding F2-3: a split option value calling a module
// function that writes state only the chunk uses splits, with that
// function and the state.
describe('round 1 F2-3: a split value calling a module function that writes state', () => {
  const route = (decls: string, component: string) =>
    [
      "import { createFileRoute } from 'toy-router'",
      'const hits: Array<string> = []',
      'const S = { v: 0 }',
      decls,
      "export const Route = createFileRoute('/')({",
      '  beforeLoad: () => hits.length + S.v,',
      `  component: ${component},`,
      '})',
    ].join('\n')

  it.each([
    [
      'its value',
      'const reg: Array<unknown> = []\nfunction wrap<T>(c: T): T { reg.push(c); return c }',
      'wrap(() => reg.length)',
    ],
    [
      'a declaration naming it',
      'const reg: Array<unknown> = []\nfunction wrap<T>(c: T): T { reg.push(c); return c }\nconst Page = wrap(() => reg.length)',
      'Page',
    ],
  ])(
    'splits %s when its wrapper writes state only the chunk uses (control)',
    async (_, decls, component) => {
      const r = await split(route(decls, component))
      expect(r.env).not.toContain('reg.push')
      expect(r.chunks.component).toContain('reg.push(c)')
    },
  )
})

describe('declarations reading each other', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { z } from 'zod'
      import { createColumnHelper } from './table'
      import { make, wrap, log } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  it.each([
    [
      'TanStack Table columns reading their helper',
      "const columnHelper = createColumnHelper()\nconst columns = [columnHelper.accessor('name', {})]",
    ],
    [
      'a schema reading a schema',
      'const Option = z.object({ id: z.string() })\nconst Field = Option.nullable()',
    ],
    [
      'a literal reading a helper result',
      'const defaults = make()\nconst fields = [defaults.name, defaults.email]',
    ],
    ['a member read of the helper result', 'const a = make()\nconst x = [a.v]'],
    [
      'three in a chain',
      'const a = make()\nconst b = wrap(a)\nconst c = wrap(b)',
    ],
  ])(
    'moves two declarations one chunk needs together, in source order: %s',
    async (_, decls) => {
      const last = /const (\w+) = [^\n]*$/.exec(decls)![1]!
      const r = await split(route(decls, `component: () => ${last},`))
      for (const line of decls.split('\n')) {
        expect(r.env).not.toContain(line)
      }
      expect(r.chunks.component).toContain(decls)
    },
  )

  // the user's module (architect, design 2 step 5)
  const tableRoute = (after: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { createColumnHelper, useTable } from '@tanstack/react-table'
      import { track } from './lib'
      const helper = createColumnHelper()
      const columns = [
        helper.display({ id: 'actions', header: 'Actions' }),
        helper.accessor('firstName', {}),
        helper.accessor((row) => row.lastName, { id: 'lastName' }),
      ]
      ${after}
      export const Route = createFileRoute('/table')({
        component: () => {
          const table = useTable({ columns })
        },
      })
    `)
  const helperAndColumns = dedent(`
    const helper = createColumnHelper()
    const columns = [
      helper.display({ id: 'actions', header: 'Actions' }),
      helper.accessor('firstName', {}),
      helper.accessor((row) => row.lastName, { id: 'lastName' }),
    ]
  `).trim()

  it('moves a column helper and the columns reading it to the component chunk, in source order', async () => {
    const r = await split(tableRoute(''))
    expect(r.env).not.toContain('createColumnHelper()')
    expect(r.env).not.toContain('const columns')
    expect(r.chunks.component).toContain(helperAndColumns)
    expect(r.chunks.component).toContain(
      "import { createColumnHelper, useTable } from '@tanstack/react-table'",
    )
  })

  // a call in a route option the route module keeps keeps neither: they
  // move to the chunk
  it('moves the column helper and the columns when a route option the route module keeps calls an unknown function', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createColumnHelper, useTable } from '@tanstack/react-table'
      import { createSchema } from 'schema-lib'
      ${helperAndColumns.split('\n').join('\n      ')}
      export const Route = createFileRoute('/table')({
        validateSearch: createSchema({ page: 'number' }),
        component: () => {
          const table = useTable({ columns })
        },
      })
    `)
    const r = await split(code)
    expect(r.env).not.toContain('createColumnHelper()')
    expect(r.env).toContain("createSchema({ page: 'number' })")
    expect(r.chunks.component).toContain(helperAndColumns)
  })

  // `a` stays (the loader reads it), `b` only the component reads: `b`
  // moves to the chunk, whether `a` is a `const` or a `let`, assigned at
  // load or not. Source: NOTE-small-items 2d.
  it.each([
    ['a `let` nothing assigns', 'let a = make()\nconst b = [a, make()]'],
    ['a `let` nothing assigns, read alone', 'let a = make()\nconst b = [a]'],
    ['a `const`', 'const a = make()\nconst b = [a, make()]'],
    [
      'a `let` assigned before the read',
      'let a = make()\na = make()\nconst b = [a, make()]',
    ],
  ])(
    'moves a declaration reading a binding the module keeps: %s',
    async (_, decls) => {
      const r = await split(
        route(decls, 'loader: () => a,\ncomponent: () => b,'),
      )
      expect(r.env).not.toContain('const b =')
      expect(r.chunks.component).toContain('const b = [a')
    },
  )
})

describe('declarations only split code needs', () => {
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
    }
  }

  it('moves a reader of state the module writes at load with that state when only split code reads both', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 0
      n++
      const label = 'n=' + n
      function Page() { return label }
      export const Route = createFileRoute('/')({
        loader: () => 'data',
        component: Page,
      })
    `)
    const r = await kept(code)
    expect(r.env).not.toContain('const label')
  })

  it('moves a declaration a bare import follows, and keeps the bare import', async () => {
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
  })
})

// A call of a known package's pure export (`RecognizerTable.pureCalls`),
// however imported (renamed, a namespace member), stays with its reader, the
// route module; a declaration only the component reads moves.
describe('a known package call the route module keeps', () => {
  const recognizer = {
    ...EMPTY_RECOGNIZER,
    pureCalls: {
      'toy-router': new Set(['getRouteApi']),
    },
  }
  async function compile(code: string, files: Record<string, string> = {}) {
    const host = new MemoryHost({
      files: { '/app/route.tsx': code, ...files },
      recognizer,
    })
    const planners = [
      toySplitPlanner({ keys: ['component', 'errorComponent'] }),
    ]
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
    }
  }
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

  it('moves a declaration only the component reads, beside a call the route module keeps', async () => {
    for (const [imports, api] of direct) {
      const r = await compile(shared(imports, api))
      expect(r.env, api).toContain(`const routeApi = ${api}`)
      expect(r.env, api).not.toContain('new JSConfetti')
      expect(r.chunk, api).toContain('const confetti = new JSConfetti()')
    }
  })
})

// Placement reads names, references and assignments, never what code does
// (DESIGN-order-guarantee-schemas.md, decision 1): a declaration built from
// member reads, spreads, `in` and standard globals moves with its only
// reader, whatever follows it.
describe('declarations built from language operations and globals', () => {
  const route = (decls: string, options: string, after = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { z } from 'zod'
      import { format, register, track } from './lib'
      const LABELS = { admin: 'Admin', user: 'User' }
      ${decls}
      ${after}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  // the schemas note's decision 1
  it('moves options built from standard globals past a schema the route module keeps', async () => {
    const decl =
      'const ROLE_OPTIONS = Object.entries(LABELS).map(([value, label]) => ({ value, label }))'
    const r = await split(
      route(
        decl,
        'validateSearch: z.object({ role: z.string().optional() }),\ncomponent: () => ROLE_OPTIONS,',
      ),
    )
    expect(r.env).not.toContain('ROLE_OPTIONS =')
    expect(r.env).not.toContain('const LABELS')
    expect(r.chunks.component).toContain(decl)
  })

  it.each([
    'const ids = Object.keys(LABELS)',
    "const all = new Set([...Object.values(LABELS), 'guest'])",
    "const names = { ...LABELS, guest: 'Guest' }",
    'const first = LABELS.admin',
    "const has = 'admin' in LABELS",
    'const max = Math.max(...Object.values(LABELS).map((l) => l.length))',
    'const json = JSON.stringify(LABELS)',
    "const sorted = Object.keys(LABELS).sort().join(', ')",
    "const opts = Object.entries(LABELS).filter(([k]) => k !== 'user').map(([value, label]) => ({ value, label }))",
    "const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })",
    "const params = new URLSearchParams({ tab: 'a' }).toString()",
    'const nonEmpty = Object.values(LABELS).filter(Boolean)',
  ])('moves `%s` past a bare call after it', async (decl) => {
    const name = /const (\w+)/.exec(decl)![1]!
    const r = await split(
      route(decl, `component: () => ${name},`, "track('after')"),
    )
    expect(r.env).not.toContain(decl)
    expect(r.env).toContain("track('after')")
    expect(r.chunks.component).toContain(decl)
  })

  // `inOrder`: the output holding the read holds the later write after it,
  // in source order
  const inOrder = (
    r: Awaited<ReturnType<typeof split>>,
    read: string,
    write: string,
  ) => {
    const where = [r.env, r.chunks.component!].find((t) => t.includes(read))!
    expect(where.indexOf(write)).toBeGreaterThan(where.indexOf(read))
  }
  const seedRoute = (decls: string, loader: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/x')({
        ${loader}component: () => ({ r }),
      })
    `)

  // the executing property (seed 1919): a reassigned `o0` whose object the
  // holder `h3` holds, written through the holder after the read
  it.each([
    ['alone', ''],
    ['with the holder the loader keeps', 'loader: () => h3,\n'],
  ])(
    'orders a read of a reassigned binding before a write through a holder of its object (%s)',
    async (_, loader) => {
      const decls =
        'let o0 = { v: 1 }\nconst h3 = { c: o0 }\no0 = o0\nconst r = [o0.v, o0.p]\nh3.c.v = 4'
      const r = await split(seedRoute(decls, loader))
      inOrder(r, 'const r = [o0.v, o0.p]', 'h3.c.v = 4')
    },
  )

  // the executing property (seed 309): an `in` through a conditional alias
  // of `o0`, and a write through a holder of `o0` after it
  it.each([
    ['alone', ''],
    ['with the object the loader keeps', 'loader: () => o0,\n'],
  ])(
    'orders an `in` through an alias before a write through a holder of the object (%s)',
    async (_, loader) => {
      const decls =
        "const on = true\nconst o0 = { v: 1 }\nconst h2 = { c: o0 }\nconst l8 = on ? o0 : null\nconst r = 'p' in l8\nh2.c.p = 4"
      const r = await split(seedRoute(decls, loader))
      inOrder(r, "const r = 'p' in l8", 'h2.c.p = 4')
    },
  )

  // the executing property (seeds 555, 1880), reported: a copy of an
  // object's member moves with the component though a route option's
  // function calls a method on the object; from the chunk the copy may run
  // after that call
  it('moves a copy of an object past a method call on it in a route option function', async () => {
    const r = await split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { mw, hoc } from './lib'
        const b5 = mw()
        const r6 = { ...b5.o }
        export const Route = createFileRoute('/x')({
          beforeLoad: hoc(function PbeforeLoad() { b5.server(() => 11); return {} }),
          component: () => ({ r6 }),
        })
      `),
      { keys: ['component'] },
    )
    expect(r.env).not.toContain('const r6')
    expect(r.chunks.component).toContain('const r6 = { ...b5.o }')
  })
})

// Code moves by the bindings that read it: what moves keeps its source
// order in its chunk, what stays its order in the route module.
describe('bindings decide where code goes', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { z } from 'zod'
      import { createTable, snapshot, snap, createStore, hydrateStores, load, getAuth, initializeApp, takeSnapshot, advance, eff1, eff2, log, setup, observer, track } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  it('moves a schema only the component reads past the schema `validateSearch` keeps', async () => {
    const r = await split(
      route(
        'const Schema = z.object({ email: z.string() })\nconst SearchSchema = z.object({ next: z.string().optional() })',
        'validateSearch: SearchSchema,\ncomponent: () => Schema,',
      ),
    )
    expect(r.env).not.toContain('const Schema')
    expect(r.env).toContain('const SearchSchema = z.object(')
    expect(r.chunks.component).toContain(
      'const Schema = z.object({ email: z.string() })',
    )
  })

  it('moves a snapshot and the object it reads when only the component reads them', async () => {
    const r = await split(
      route(
        "const table = createTable()\nconst other = createTable()\nconst columns = snapshot(table)\nother.addColumn('x')",
        'loader: () => other,\ncomponent: () => columns,',
      ),
    )
    expect(r.env).not.toContain('snapshot(table)')
    expect(r.chunks.component).toContain(
      'const table = createTable()\nconst columns = snapshot(table)',
    )
  })

  // the chunk takes `seen` and what it reads, and the write through `alias`
  // after them, in source order (the snapshot sees `v: 1` as in the source)
  it('gives the chunk a snapshot, the object it reads and a write through another name after it, in source order', async () => {
    const decls =
      'const cfg = { v: 1 }\nconst alias = cfg\nconst seen = snap(cfg)\nalias.v = 2'
    const r = await split(route(decls, 'component: () => seen,'))
    expect(r.env).not.toContain('snap(cfg)')
    expect(r.chunks.component).toContain(decls)
  })

  // what moving by bindings reorders (DESIGN-order-none.md §3, DESIGN-order-
  // guarantee-aggressive.md S-1 to S-3): the module then runs them in
  // another order, without a warning. The router-plugin build test
  // (`code-splitter-effect-order`) runs S-1, S-2 and (a).
  describe('what it reorders', () => {
    it('moves a value only the component reads past a bare call after it (a)', async () => {
      const r = await split(
        route(
          'const store = createStore()\nhydrateStores()',
          'component: () => store,',
        ),
      )
      expect(r.env).not.toContain('createStore()')
      expect(r.env).toContain('hydrateStores()')
      expect(r.chunks.component).toContain('const store = createStore()')
    })

    // a top-level await that moves no longer delays what follows it
    it('moves an awaited declaration only the component reads into its chunk (c)', async () => {
      const r = await split(
        route(
          'const data = await load()\nconst auth = getAuth()',
          'loader: () => auth,\ncomponent: () => data,',
        ),
      )
      expect(r.env).not.toContain('await load()')
      expect(r.env).toContain('const auth = getAuth()')
      expect(r.chunks.component).toContain('const data = await load()')
    })

    // (d): the value moves with what it reads; `track('ready')` now runs
    // before `setup()`
    it('moves a split option value and what it hands an unknown call past a call after it (d)', async () => {
      const r = await split(
        dedent(`
          import { createFileRoute } from 'toy-router'
          import { setup, observer, track } from './lib'
          const cfg = setup()
          function Page() { return 'page' }
          export const Route = createFileRoute('/')({
            component: observer(Page, cfg),
          })
          track('ready')
        `),
      )
      expect(r.env).not.toContain('setup()')
      expect(r.env).toContain("track('ready')")
      expect(r.chunks.component).toContain(
        "const cfg = setup()\nfunction Page() { return 'page' }\nconst TsrSplitComponent = observer(Page, cfg)",
      )
    })

    it('moves a setup call only the component reads past a call that needs it (S-1)', async () => {
      const r = await split(
        route(
          'const app = initializeApp({ name: "x" })\nconst auth = getAuth()',
          'loader: () => auth,\ncomponent: () => app,',
        ),
      )
      expect(r.env).not.toContain('initializeApp(')
      expect(r.chunks.component).toContain('const app = initializeApp(')
    })

    it('moves a snapshot past a later value whose call advances what it read (S-2)', async () => {
      const r = await split(
        route(
          'const before = takeSnapshot()\nconst state = advance()',
          'loader: () => state,\ncomponent: () => before,',
        ),
      )
      expect(r.env).not.toContain('takeSnapshot()')
      expect(r.chunks.component).toContain('const before = takeSnapshot()')
    })

    it('moves two values two chunks read to their chunks, which load in either order (S-3)', async () => {
      const r = await split(
        route(
          'const a = track(1)\nconst b = track(2)',
          'component: () => a,\nerrorComponent: () => b,',
        ),
        { keys: ['component', 'errorComponent'] },
      )
      expect(r.env).not.toContain('track(')
      expect(r.chunks.component).toContain('const a = track(1)')
      expect(r.chunks.errorComponent).toContain('const b = track(2)')
    })
  })
})

// A top-level statement that is no declaration (a call, an assignment, an
// `if`/`try`/loop block) stays in the route module (R154); declarations
// move by what reads them.
describe('statements and the declarations beside them', () => {
  const route = (decls: string, options: string, imports = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { z } from 'zod'
      import { createTable, snapshot, fetchSettings, createRegistry, observer, initializeApp, connectAuthEmulator, getAuth } from './lib'
      ${imports}
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)

  it('keeps the base schema `validateSearch` reads and moves its extension (2)', async () => {
    const r = await split(
      route(
        'const Base = z.object({ page: z.number() })\nconst Full = Base.extend({ q: z.string() })',
        'validateSearch: Base,\ncomponent: () => Full,',
      ),
    )
    expect(r.env).toContain('const Base = z.object(')
    expect(r.env).not.toContain('Base.extend(')
    expect(r.chunks.component).toContain(
      'const Full = Base.extend({ q: z.string() })',
    )
  })

  it('moves an awaited value only the component reads (5)', async () => {
    const r = await split(
      route('const data = await fetchSettings()', 'component: () => data,'),
    )
    expect(r.env).not.toContain('fetchSettings()')
    expect(r.chunks.component).toContain('const data = await fetchSettings()')
  })

  it("keeps a statement changing an import's object the component uses (Sentry)", async () => {
    const r = await split(
      route(
        "Sentry.init({ dsn: 'https://x' })",
        'component: () => Sentry.lastEventId(),',
        "import * as Sentry from '@sentry/react'",
      ),
    )
    expect(r.env).toContain("Sentry.init({ dsn: 'https://x' })")
    expect(r.chunks.component).not.toContain('Sentry.init(')
  })

  it("keeps a statement changing an import's object (i18n.use)", async () => {
    const r = await split(
      route(
        'i18n.use(backend)',
        "component: () => i18n.t('x'),",
        "import i18n from 'i18next'\nimport backend from 'i18next-http-backend'",
      ),
    )
    expect(r.env).toContain('i18n.use(backend)')
    expect(r.chunks.component).not.toContain('i18n.use(')
  })

  it('keeps a statement touching through an alias an object the route module keeps', async () => {
    const r = await split(
      route(
        "const table = createTable()\nconst alias = table\nalias.addColumn('x')",
        'validateSearch: table.schema,\ncomponent: () => alias,',
      ),
    )
    expect(r.env).toContain(
      "const table = createTable()\nconst alias = table\nalias.addColumn('x')",
    )
  })

  // what moves later (reported): what a declaration runs at load runs
  // when the chunk loads
  describe('what it moves later', () => {
    // the executing property (real planner, builders off: seeds 1302,
    // 1141, 1055): a copy of a member of an object a split option value
    // calls a method on moves to the chunk reading it
    describe('an unknown method call around a member read of its object', () => {
      const mwRoute = (decls: string, options: string) =>
        dedent(`
          import { createFileRoute } from 'toy-router'
          import { mw, run } from './lib'
          ${decls.split('\n').join('\n          ')}
          export const Route = createFileRoute('/x')({
            ${options.split('\n').join('\n            ')}
          })
        `)

      it('moves the copy away from a call in a split option value (seed 1055)', async () => {
        const r = await split(
          mwRoute(
            'const b4 = mw()\nconst r6 = { ...b4.o }',
            'loader: (b4.server(() => 16), () => ({})),\ncomponent: () => ({ r6 }),',
          ),
          { keys: ['loader', 'component'] },
        )
        // (`b4`, which two chunks read, goes to their shared module)
        expect(r.env).not.toContain('const b4 = mw()')
        expect(r.chunks.loader).toContain('b4.server(() => 16)')
        expect(r.chunks.component).toContain('const r6 = { ...b4.o }')
      })
    })

    // a value only the component reads moves past a bare call after it;
    // nothing is reported
    it('moves a value past a bare call after it, unreported', async () => {
      const r = await split(
        route(
          'const table = createTable()\nconnectAuthEmulator()',
          'component: () => table,',
        ),
      )
      expect(r.env).not.toContain('createTable()')
      expect(r.env).toContain('connectAuthEmulator()')
    })
  })
})

// A top-level statement that is no declaration stays in the route module
// (R154), whatever it uses, and the component chunk holds none of it.
describe('top-level statements stay in the route module (R154)', () => {
  const route = (decls: string, options: string, imports = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { createTable, createStore, createClient, sentryPlugin, persistPlugin, analytics, later } from './lib'
      import * as Sentry from '@sentry/react'
      import PropTypes from 'prop-types'
      ${imports}
      const on = true
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)
  /** `decls` in the module, in order, and none of it in the component chunk. */
  const stays = (r: Awaited<ReturnType<typeof split>>, decls: string) => {
    expect(r.env).toContain(decls)
    for (const line of decls.split('\n')) {
      expect(r.chunks.component).not.toContain(line)
    }
  }

  describe('stays, using an import or a binding the module keeps', () => {
    it.each([
      ['`Sentry.init({ dsn })`', "Sentry.init({ dsn: 'x' })"],
      ['`i18n.use(backend)`', 'i18n.use(backend)'],
    ])('%s', async (_, statement) => {
      const r = await split(
        route(
          statement,
          "component: () => [Sentry.lastEventId(), i18n.t('x')],",
          "import i18n from 'i18next'\nimport backend from 'i18next-http-backend'",
        ),
      )
      stays(r, statement)
    })

    it.each([['alone', 'fill(k)']])(
      'a binding the module keeps, handed to a local function it calls (%s)',
      async (_, statement) => {
        const decls = `const k = createTable()\nconst d = createTable()\nfunction fill(o) { o.v = 3 }\n${statement}`
        const r = await split(
          route(decls, 'loader: () => k,\ncomponent: () => d,'),
        )
        expect(r.env).toContain(statement)
        expect(r.chunks.component).not.toContain(statement)
      },
    )
  })
})

// The names `main` shares (two option groups read them) live in one shared
// module per file; a binding code outside the set assigns leaves it, and a
// top-level statement stays in the route module (R154).
describe('the shared module of a route file', () => {
  const keys = ['component', 'loader']
  async function compile(code: string) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ keys })]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    const chunks: Record<string, string> = {}
    const shared = new Set<string>()
    for (const key of keys) {
      const c =
        (await host.compile(`/app/route.tsx?tsr-split=${key}`, planners, env))
          ?.code ?? ''
      chunks[key] = c
      for (const m of c.matchAll(
        /'(\/app\/route\.tsx\?tsr-split=shared---[^']+)'/g,
      )) {
        shared.add(m[1]!)
      }
    }
    const modules: Array<string> = []
    for (const id of shared) {
      modules.push((await host.compile(id, planners, env))?.code ?? '')
    }
    return {
      env: out?.code ?? '',
      chunks,
      shared: modules,
      diagnostics: (out?.diagnostics ?? []).filter((d) =>
        /^(eager|shared)-/.test(d.code ?? ''),
      ),
    }
  }
  const route = (body: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { make, link } from './lib'
      ${body.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({ ${options} })
    `)

  // a statement stays, whoever writes what it reads
  it('keeps a statement reading a binding another chunk writes', async () => {
    const r = await compile(
      route(
        'const cache = new Map()\nlink(cache)',
        "component: () => cache, loader: () => { cache.set('a', 1); return 1 }",
      ),
    )
    expect(r.env).toContain('link(cache)')
  })

  // the executing property (toy planner, seed 11838): a binding the loader
  // assigns leaves the shared set, and no shared module imports the loader
  // chunk (a cycle: `w14` read before initialisation); the loader, assigning
  // a binding the component's chunk copies too, stays (shared-writer), and
  // that chunk copies the unused declaration reading what it copies (R1)
  it('copies an unused declaration into the chunk taking what it reads, which no shared module imports', async () => {
    const code = route(
      'let o10 = { v: 6 }\nconst w14 = Object.assign(o10, { p: 8 })\nconst l17 = w14 ? 1 : 0',
      'component: () => w14, loader: () => { o10 = w14; return 1 }',
    )
    const r = await compile(code)
    for (const m of r.shared) {
      expect(m).not.toContain('?tsr-split=loader')
    }
    expect(r.env).toContain('loader: () => { o10 = w14; return 1 }')
    expect(r.chunks.component).toContain('const l17 = w14 ? 1 : 0')
  })

  it('keeps a statement using a binding the route module keeps', async () => {
    const r = await compile(
      route(
        'const k = make()\nconst d = make()\nlink(k, d)',
        'component: () => d, loader: () => 1,\n      validateSearch: () => k',
      ),
    )
    expect(r.env).toContain('const k = make()\nconst d = make()\nlink(k, d)')
    expect(r.shared).toEqual([])
  })
})

// Finding 3 (part B) and the fresh review's finding 5: a top-level
// statement stays in the route module (R154); what it reads is imported or
// moves as for any other reader.
describe('statements that change an import or hand it the route', () => {
  async function report(
    code: string,
    keys = ['component'],
    files: Record<string, string> = {},
  ) {
    const host = new MemoryHost({
      files: { '/app/route.tsx': code, ...files },
    })
    const planners = [toySplitPlanner({ keys })]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    const chunks: Record<string, string> = {}
    for (const key of keys) {
      chunks[key] =
        (await host.compile(`/app/route.tsx?tsr-split=${key}`, planners, env))
          ?.code ?? ''
    }
    return {
      env: out?.code ?? '',
      chunks,
    }
  }

  // an import a statement changes is no declaration of the module: the
  // statement stays, the chunk imports the import itself
  it('keeps a statement changing an import, which the chunk imports itself', async () => {
    const r = await report(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { persistPlugin, store } from './lib'
        store.add(persistPlugin)
        export const Route = createFileRoute('/')({ component: () => store.get() })
      `),
    )
    expect(r.env).toContain('store.add(persistPlugin)')
    expect(r.env).not.toContain('export { store }')
    expect(r.chunks.component).toContain("import { store } from './lib'")
  })

  // (the spelling variants: a hoisted component the route's value holds
  // moves; a statement handing the route to an import stays)
  it('keeps a statement handing the route to an import and moves the component', async () => {
    const r = await report(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { registerRoute } from './registry'
        const Page = () => 1
        export const Route = createFileRoute('/')({ component: Page })
        registerRoute(Route)
      `),
    )
    expect(r.env).toContain('registerRoute(Route)')
    expect(r.chunks.component).toContain('const Page = () => 1')
  })
})

// A read of an enum or namespace member and a write through another name
// after it keep their source order in the output holding the read.
describe('an enum or namespace written through another name', () => {
  const run = (decls: string) =>
    split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        ${decls.split('\n').join('\n        ')}
        export const Route = createFileRoute('/')({ component: () => y })
      `),
    )
  // the read and the write stay in one module, in source order
  const inOrder = (
    r: Awaited<ReturnType<typeof split>>,
    read: string,
    write: string,
  ) => {
    const where = [r.env, r.chunks.component!].find((t) => t.includes(read))!
    expect(where.indexOf(write)).toBeGreaterThan(where.indexOf(read))
  }

  it('orders an enum member read before a write through an alias', async () => {
    const r = await run(
      "enum E { A = 'OLD' }\nconst alias: any = E\nconst y = E.A\nalias.A = 'NEW'",
    )
    inOrder(r, 'const y = E.A', "alias.A = 'NEW'")
  })

  it('orders an enum member read before a write through an import alias', async () => {
    const r = await run(
      "enum E { A = 'OLD' }\nimport F = E\nconst y = E.A\n;(F as any).A = 'NEW'",
    )
    inOrder(r, 'const y = E.A', "(F as any).A = 'NEW'")
  })

  it('orders an enum member read before a write through a holder', async () => {
    const r = await run(
      "enum E { A = 'OLD' }\nconst holder = { e: E as any }\nconst y = E.A\nholder.e.A = 'NEW'",
    )
    inOrder(r, 'const y = E.A', "holder.e.A = 'NEW'")
  })

  it('orders a merged namespace member read before a write through an alias', async () => {
    const r = await run(
      "namespace N { export const A = 'OLD' }\nconst alias: any = N\nconst y = N.A\nalias.A = 'NEW'",
    )
    inOrder(r, 'const y = N.A', "alias.A = 'NEW'")
  })
})

describe('generated imports', () => {
  // A planner's runtime helper (Start's server-fn stubs `createClientRpc`,
  // `createSsrRpc`) is an import like one the source wrote: every output
  // reading it imports it itself, never through the env module (the
  // verifier's rule (e)), and one nothing reads is dropped.
  /** A planner importing `stub` (as `tsrStub`) and wrapping each of `literals` in a call of it. */
  const wrapping = (literals: Array<string>): Planner => ({
    name: 'toy-wrap',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const stub = ctx.names.alloc('tsrStub')
      ctx.rewrites.addGenerated({
        body: [],
        declares: [],
        effectful: false,
        anchor: { k: 'after-header' },
        home: 'auto',
        by: 'toy-wrap',
        imports: [
          {
            names: [{ imported: 'stub', local: stub.sym }],
            spec: {
              k: 'spec',
              specifier: 'toy-runtime',
              edgeKey: ctx.edgeKey('toy-runtime', 'static', 'runtime'),
            },
          },
        ],
      })
      for (const literal of literals) {
        const start = ctx.analysis.source.code.indexOf(literal)
        ctx.rewrites.edit({
          range: { start, end: start + literal.length },
          body: [{ k: 'text', parts: [{ sym: stub.sym }, `(${literal})`] }],
          by: 'toy-wrap',
        })
      }
    },
  })
  const imported = "import { stub as tsrStub } from 'toy-runtime'"
  async function compileAll(
    code: string,
    literals: Array<string>,
    ids: Array<string>,
    opts: {
      keys?: Array<string>
      type?: 'client' | 'server'
      imported?: Array<string>
    } = {},
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toySplitPlanner({
        keys: opts.keys ?? ['component'],
        imported: opts.imported,
      }),
      wrapping(literals),
    ]
    const type = opts.type ?? 'client'
    const options = { env: envInfo({ mode: 'build', type, name: type }) }
    const out: Record<string, string> = {}
    for (const id of ['', ...ids]) {
      const r = await host.compile(`/app/route.tsx${id}`, planners, options)
      expect(r, id).not.toBeNull()
      out[id] = r!.code
    }
    return out
  }

  it('are imported by each split chunk reading them, with no shared module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const a = [1]
      const b = [2]
      export const Route = createFileRoute('/')({
        component: () => a[0],
        errorComponent: () => b[0],
      })
    `)
    const ids = ['?tsr-split=component', '?tsr-split=errorComponent']
    const out = await compileAll(code, ['[1]', '[2]'], ids, {
      keys: ['component', 'errorComponent'],
    })
    expect(out['']).not.toContain('tsrStub')
    for (const id of ids) {
      expect(out[id], id).toContain(imported)
      expect(out[id], id).not.toContain('/app/route.tsx')
    }
  })

  it('are carried by a chunk copying a function export that reads them', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function make() { return [3] }
      export const Route = createFileRoute('/')({ component: () => make() })
    `)
    const id = '?tsr-split=component'
    const out = await compileAll(code, ['[3]'], [id], { imported: ['Route'] })
    expect(out[id]).toContain('function make() { return tsrStub([3]) }')
    expect(out[id]).toContain(imported)
  })

  it('are dropped when no output reads them', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const a = [1]
      export const Route = createFileRoute('/')({ component: () => a[0] })
    `)
    const id = '?tsr-split=component'
    const out = await compileAll(code, [], [id])
    expect(out['']).not.toContain('toy-runtime')
    expect(out[id]).not.toContain('toy-runtime')
  })
})

// A compile's builder chains (`RecognizerTable.builderLinks`) are placed as
// any declaration, in either environment: a chain only split code reads
// leaves the route module, on a `const` builder too, and an exported one
// built on a `const` builder compiles as the inline chain.
describe('builder chains in a compile', () => {
  const recognizer: RecognizerTable = {
    ...EMPTY_RECOGNIZER,
    factories: {
      'toy-start': {
        createServerFn: 'serverFn',
        createMiddleware: 'middleware',
      },
    },
    builderKinds: new Set(['serverFn', 'middleware']),
    terminal: { serverFn: 'serverFn', middleware: 'middleware' },
    builderLinks: {
      serverFn: {
        middleware: 'both',
        validator: 'server',
        handler: 'server',
      },
      middleware: { middleware: 'both', server: 'server' },
    },
  }
  async function compile(code: string, type: 'client' | 'server') {
    const host = new MemoryHost({
      files: { '/app/route.tsx': code },
      recognizer,
    })
    const planners = [
      toySplitPlanner({ keys: ['component', 'errorComponent'] }),
    ]
    const env = envInfo({ mode: 'build', type, name: type })
    const main = await host.compile('/app/route.tsx', planners, { env })
    return {
      env: main?.code ?? '',
    }
  }
  const route = (declarations: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { createServerFn } from 'toy-start'
      import { type } from 'arktype'
      import { track } from './track'
      ${declarations.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        component: () => fn,
        errorComponent: () => fn,
      })
    `)

  it('moves a page-only chain into the chunk in both environments', async () => {
    const code = route(
      'const fn = createServerFn().middleware([]).validator(track).handler(async () => track())',
    )
    for (const type of ['client', 'server'] as const) {
      const r = await compile(code, type)
      expect(r.env, type).not.toContain('createServerFn()')
    }
  })

  // two split options alone: their shared module; which argument is an
  // effect in which environment is a target fact (facts.test, "builder
  // chains per environment")
  it('puts a chain two split options read in their shared module, in both environments', async () => {
    const code = route(
      'const fn = createServerFn().middleware([track()]).handler(async () => 1)',
    )
    for (const type of ['client', 'server'] as const) {
      const r = await compile(code, type)
      expect(r.env, type).not.toContain('const fn =')
    }
  })

  // A chain on a builder held in a `const` moves as the inline chain does
  // (R139).
  it('moves a page-only chain on a const builder into the chunk in both environments', async () => {
    const code = route(
      'const base = createServerFn()\nconst fn = base.handler(async () => 1)',
    )
    for (const type of ['client', 'server'] as const) {
      const r = await compile(code, type)
      expect(r.env, type).not.toContain('createServerFn()')
    }
  })

  // A builder in a `const` and its one link is the inline chain spelled in
  // two statements (spelling variants §7), compiled alike (R139).
  it('compiles an exported server fn built on a const builder as the inline chain', async () => {
    const outputs = async (declarations: string, type: 'client' | 'server') => {
      const host = new MemoryHost({
        files: { '/app/route.tsx': route(declarations) },
        recognizer,
      })
      const planners = [toySplitPlanner({ keys: ['component'] })]
      const env = envInfo({ mode: 'build', type, name: type })
      const out: Array<string> = []
      for (const id of [
        '/app/route.tsx',
        '/app/route.tsx?tsr-split=component',
      ]) {
        const o = await host.compile(id, planners, { env })
        out.push(o?.code ?? '')
        out.push(
          ...(o?.diagnostics ?? []).map((d) => `${d.severity} ${d.code}`),
        )
      }
      return out
    }
    const inline = 'export const fn = createServerFn().handler(async () => 1)'
    const hoisted =
      'const base = createServerFn()\nexport const fn = base.handler(async () => 1)'
    for (const type of ['client', 'server'] as const) {
      // the hoisted spelling's text, written as the inline chain
      const hoistedOut = (await outputs(hoisted, type)).map((s) =>
        s
          .replace('const base = createServerFn()\n', '')
          .replace('base.handler(', 'createServerFn().handler('),
      )
      expect(hoistedOut, type).toEqual(await outputs(inline, type))
    }
  })
})

describe('a statement an edit rewrites from its first byte', () => {
  it('stays, and what the rest of it reads stays with it', async () => {
    const code = dedent(`
      import { clientOnly } from 'toy-start'
      const label = 'L'
      function use(value) { return value }
      clientOnly(() => use(label))();
    `)
    const host = new MemoryHost({ files: { '/app/m.ts': code } })
    const out = await host.compile('/app/m.ts', [toyEnvPlanner()], {
      env: envInfo(),
    })
    expect(out?.code).toContain(`const label = 'L'`)
    expect(out?.code).toContain('function use(value)')
    expect(out?.code).toContain('() => use(label)')
  })

  it('leaves no read behind on the side that gets the stub', async () => {
    const code = dedent(`
      import { clientOnly } from 'toy-start'
      const label = 'L'
      clientOnly(() => label)();
    `)
    const host = new MemoryHost({ files: { '/app/m.ts': code } })
    const out = await host.compile('/app/m.ts', [toyEnvPlanner()], {
      env: envInfo({ name: 'ssr', type: 'server' }),
    })
    expect(out?.code).not.toContain('label')
    expect(out?.code).toContain('(() => {})()')
  })
})

describe('a comment after a statement, before code on the same line', () => {
  const moved = (comment: string, rest: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      const a = 'A'; ${comment} ${rest}
      export const Route = createFileRoute('/')({ component: () => a })
    `)
  async function outputs(code: string) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner()]
    const env = await host.compile('/app/route.tsx', planners)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
    )
    return { env: env?.code ?? '', chunk: chunk?.code ?? '' }
  }

  it.for([
    '/* @__PURE__ */',
    '/* #__PURE__ */',
    '/*! MARK */',
    '/* @license MARK */',
    '/* @preserve MARK */',
  ])('%s stays with that code, not with what moves', async (comment) => {
    const { env, chunk } = await outputs(moved(comment, 'mk()'))
    expect(env).toContain(`${comment} mk()`)
    expect(chunk).not.toContain(comment)
  })

  it('an annotation of a function declared next stays with it', async () => {
    const { env, chunk } = await outputs(
      moved('/* @__NO_SIDE_EFFECTS__ */', 'function mk() { return g() }\nmk()'),
    )
    expect(env).toContain('/* @__NO_SIDE_EFFECTS__ */ function mk()')
    expect(chunk).not.toContain('@__NO_SIDE_EFFECTS__')
  })

  it('an ordinary comment still goes with the statement', async () => {
    const { env, chunk } = await outputs(moved('/* about a */', 'mk()'))
    expect(env).not.toContain('about a')
    expect(chunk).toContain('/* about a */')
  })

  it.for(['/* about a */', '// about a'])(
    '%s that ends the line goes with the statement',
    async (comment) => {
      const { env, chunk } = await outputs(moved(comment, '\nmk()'))
      expect(env.slice(0, env.indexOf('mk()'))).not.toContain(comment)
      expect(chunk).toContain(comment)
    },
  )

  it.for([
    ['/* @__PURE__ */', '\n'],
    ['/* #__PURE__ */', '\r\n'],
    ['/*! MARK */', '\n'],
    ['/* @license MARK */', '\n'],
    ['/* @__PURE__ */', ' // about mk\n'],
    ['/* @__PURE__ */', ' /* about\nmk */ '],
    ['/* @__PURE__ */', '\n/* about\nmk */\n'],
    ['// @__PURE__', '\n'],
    ['// #__NO_SIDE_EFFECTS__', '\n'],
  ])(
    '%s ending the line stays with the code on a later line (then %j)',
    async ([comment, between]) => {
      const { env, chunk } = await outputs(moved(comment!, `${between}mk()`))
      expect(env).toContain(`${comment} ${between}mk()`)
      expect(chunk).not.toContain(comment)
    },
  )

  it('generated imports go before an annotation after a directive', async () => {
    const { env } = await outputs(
      dedent(`
        'use client'; /* @__PURE__ */ mk()
        import { createFileRoute } from 'toy-router'
        const a = 'A'
        export const Route = createFileRoute('/')({ component: () => a })
      `),
    )
    expect(env).toContain('/* @__PURE__ */ mk()')
  })

  it('a statement ended by its brace keeps the annotation on the next code', async () => {
    // (R154: a top-level statement stays)
    const { env } = await outputs(
      moved('', 'function f() { return a } /* @__PURE__ */ mk(f)'),
    )
    expect(env).toMatch(/\/\* @__PURE__ \*\/ mk\(f\)/)
  })
})

describe('generated units for the env module readers', () => {
  /** Adds, after the split planner, a unit for the outputs reading what the env module keeps, the route aside. */
  const readersPlanner = (
    body: (own: SymbolId, other: SymbolId) => Array<string | { sym: SymbolId }>,
  ): Planner => ({
    name: 'toy-readers',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const found = findRouteOptions(ctx)
      if (!found) {
        return
      }
      const own = ctx.names.alloc('register')
      ctx.rewrites.addGenerated({
        body: [{ k: 'text', parts: body(own.sym, found.unit.declares[0]!) }],
        declares: [],
        effectful: true,
        anchor: { k: 'end' },
        home: { k: 'env-readers', besides: [found.unit.declares[0]!] },
        by: 'toy-readers',
        imports: [
          {
            names: [{ imported: 'register', local: own.sym }],
            spec: {
              k: 'spec',
              specifier: 'toy-hmr',
              edgeKey: ctx.edgeKey('toy-hmr', 'static', 'runtime'),
            },
          },
        ],
      })
    },
  })

  const compile = async (
    code: string,
    planner: Planner,
    imported?: Array<string>,
  ) => {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toyEnvPlanner(),
      toySplitPlanner({ keys: ['component', 'pendingComponent'], imported }),
      planner,
    ]
    const env = envInfo({})
    const main = await host.compile('/app/route.tsx', planners, { env })
    const chunk = async (key: string) =>
      (await host.compile(`/app/route.tsx?tsr-split=${key}`, planners, { env }))
        ?.code ?? ''
    return {
      env: main?.code ?? '',
      component: await chunk('component'),
      pending: await chunk('pendingComponent'),
    }
  }

  it('goes into each chunk importing a binding the route module keeps, and nowhere else', async () => {
    const out = await compile(
      ROUTE(
        `loader: () => value.text,
         component: () => value.text,
         pendingComponent: () => Route.id,`,
        `const value = { text: 'v' }`,
      ),
      readersPlanner((own) => [{ sym: own }, '()\n']),
      ['Route', 'value'],
    )
    expect(out.component).toMatch(/import \{ value \} from/)
    expect(out.component).toContain(`import { register } from 'toy-hmr'`)
    expect(out.component).toMatch(/\nregister\(\)\n/)
    // a chunk importing only the route, and the env module, don't get it
    expect(out.pending).toMatch(/import \{ Route \} from/)
    expect(out.pending).not.toContain('register')
    expect(out.env).not.toContain('register')
  })

  it('goes nowhere when the chunks copy what they read', async () => {
    const out = await compile(
      ROUTE(
        `loader: () => text,
         component: () => text,`,
        `const text = 'v'`,
      ),
      readersPlanner((own) => [{ sym: own }, '()\n']),
    )
    expect(out.component).toContain(`const text = 'v'`)
    expect(out.component).not.toContain('register')
  })

  it('reads nothing but its own imports', async () => {
    await expect(
      compile(
        ROUTE(`component: () => null,`),
        readersPlanner((own, route) => [
          { sym: own },
          '(',
          { sym: route },
          ')\n',
        ]),
      ),
    ).rejects.toThrow(/reads only its own imports/)
  })
})

// A planner's text for outputs another planner declares (`{ kinds }`):
// Start renders a server fn's caller copy in split chunks (R159).
describe("a planner's text in split chunks", () => {
  const code = dedent(`
    import { createFileRoute } from 'toy-router'
    const cfg = { n: 1 }
    const save = { run: () => cfg.n }
    export const Route = createFileRoute('/')({
      component: () => [cfg.n, save.run()],
    })
  `)
  /**
   * A planner's lazy module roots generated code naming `save` (Start's
   * re-export of a server fn's wrapper), and the planner renders `save`'s
   * value otherwise in split chunks (a `{ kinds }` scope: Start's caller
   * copy of a server fn, R159).
   */
  const toyLazyRoot: Planner = {
    name: 'toy-lazy-root',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const named = (n: string) =>
        [...ctx.analysis.file.bindings]
          .map((b) => ctx.symbols.ofBinding(b))
          .find(
            (s) => ctx.symbols.isModuleLevel(s) && ctx.symbols.name(s) === n,
          )
      const route = named('Route')
      const sym = named('save')
      if (route === undefined || sym === undefined) {
        return
      }
      // a route file: the core places it as route splitting on `main`
      ctx.setRouteModule({ imported: new Set([route]), shared: new Set() })
      const out = ctx.declareOutput({
        kind: 'custom',
        key: 'handler',
        derived: { kind: 'handler', value: '' },
      })
      ctx.addRoot(out, {
        t: 'gen',
        id: ctx.rewrites.addGenerated({
          body: [{ k: 'text', parts: ['export { ', { sym }, ' as tsrFn }\n'] }],
          declares: [],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-lazy-root',
        }),
      })
      const src = ctx.analysis.source.code
      const value = '{ run: () => cfg.n }'
      const start = src.indexOf(value)
      ctx.rewrites.placeholder({
        range: { start, end: start + value.length },
        body: [{ k: 'text', parts: ['stub()'] }],
        scope: { kinds: ['split'] },
        by: 'toy-lazy-root',
      })
    },
  }

  it('lives in the lazy module when the env module does not keep it; a split chunk renders it as its planner does there', async () => {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
    const out = async (id: string) =>
      (await host.compile(id, [toySplitPlanner(), toyLazyRoot], { env }))
        ?.code ?? ''
    const r = {
      env: await out('/app/route.tsx'),
      chunk: await out('/app/route.tsx?tsr-split=component'),
      handler: await out('/app/route.tsx?tss-serverfn-handler'),
    }
    expect(r.env).not.toContain('save')
    expect(r.handler).toContain('const save = { run: () => cfg.n }')
    expect(r.chunk).toContain('const save = stub()')
    expect(r.chunk).not.toContain('run: () => cfg.n')
  })
})

// A planner's lazy module (`custom`, Start's server-fn handler module)
// imports what the env module keeps (R157 rule 3). A declaration only it
// reaches moves there, unless evaluating it reads, by name and
// transitively, something the env module keeps: then it stays in the env
// module (rule 4). A declaration that is exactly a function evaluates
// nothing and moves.
describe('the lazy module of a planner (custom)', () => {
  /** Moves the text of `lazy(<text>)` into the lazy module, as Start moves a handler. */
  const toyLazy: Planner = {
    name: 'toy-lazy',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const code = ctx.analysis.source.code
      const at = code.indexOf('lazy(')
      if (at < 0) {
        return
      }
      const range = { start: at + 'lazy('.length, end: code.lastIndexOf(')') }
      const out = ctx.declareOutput({
        kind: 'custom',
        key: 'handler',
        derived: { kind: 'handler', value: '' },
      })
      const local = ctx.names.alloc('tsrHandler')
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['export const ', { sym: local.sym }, ' = '] },
          { k: 'region', id: ctx.region(range, 'custom') },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [local.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: out,
        by: 'toy-lazy',
      })
      ctx.addRoot(out, { t: 'gen', id: owner })
      ctx.rewrites.claim({
        region: ctx.region(range, 'custom'),
        owner,
        placeholder: [{ k: 'text', parts: ['null'] }],
        by: 'toy-lazy',
      })
    },
  }
  const compileBoth = async (code: string) => {
    const host = new MemoryHost({ files: { '/app/mod.ts': code } })
    const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
    const out = async (id: string) =>
      (await host.compile(id, [toyLazy], { env }))?.code ?? ''
    return {
      env: await out('/app/mod.ts'),
      lazy: await out('/app/mod.ts?tss-serverfn-handler'),
    }
  }
  const imports = (code: string, name: string) =>
    new RegExp(
      `import \\{[^}]*\\b${name}\\b[^}]*\\} from '/app/mod\\.ts'`,
    ).test(code)

  it('imports what the env module keeps', async () => {
    const r = await compileBoth(
      dedent(`
        let count = 0
        export const read = () => count
        export const fn = lazy(() => count)
      `),
    )
    expect(r.env).toContain('let count = 0')
    expect(r.lazy).not.toContain('let count')
    expect(imports(r.lazy, 'count')).toBe(true)
  })

  it('leaves in the env module a declaration whose evaluation reads what it keeps, also through a function', async () => {
    const r = await compileBoth(
      dedent(`
        const cfg = { url: 'a' }
        const snapshot = cfg.url
        function read() { return cfg.url }
        const viaRead = read()
        function set(o: { url: string }) { o.url = 'b' }
        set(cfg)
        export const fn = lazy(() => [snapshot, viaRead])
      `),
    )
    expect(r.env).toContain('const snapshot = cfg.url')
    expect(r.env).toContain('const viaRead = read()')
    expect(imports(r.lazy, 'snapshot')).toBe(true)
    expect(imports(r.lazy, 'viaRead')).toBe(true)
    expect(r.lazy).not.toContain('cfg.url')
  })

  it('moves a function, and a declaration reading only imports or what moves', async () => {
    const r = await compileBoth(
      dedent(`
        import { connect } from 'db'
        const cfg = { url: 'a' }
        const reader = () => cfg.url
        function helper() { return conn }
        const conn = connect()
        const viaConn = helper()
        export const getCfg = () => cfg.url
        export const fn = lazy(() => [reader(), viaConn])
      `),
    )
    expect(r.env).not.toContain('const reader')
    expect(r.env).not.toContain('connect')
    expect(r.lazy).toContain('const reader = () => cfg.url')
    expect(r.lazy).toContain('const conn = connect()')
    expect(r.lazy).toContain('const viaConn = helper()')
    expect(r.lazy).toContain(`from 'db'`)
    expect(imports(r.lazy, 'cfg')).toBe(true)
  })

  // R158 amendment: rule 4 counts declarations of the source; one a planner
  // generates (Start's lazy-handler loader) is no state of the file, since
  // no source code can name it (the step-4 stop: 22 corpus routes)
  it("moves a declaration whose evaluation reads only a planner's generated declaration the env module keeps", async () => {
    /** A generated `tsrLoad` the env module roots, which the text in `wrap(…)` reads (as Start's handler stand-in reads its loader). */
    const toyLoader: Planner = {
      name: 'toy-loader',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const code = ctx.analysis.source.code
        const at = code.indexOf('wrap(0)')
        if (at < 0) {
          return
        }
        const load = ctx.names.alloc('tsrLoad')
        ctx.addRoot('env', {
          t: 'gen',
          id: ctx.rewrites.addGenerated({
            body: [
              {
                k: 'text',
                parts: ['const ', { sym: load.sym }, ' = () => 1\n'],
              },
            ],
            declares: [load.sym],
            effectful: false,
            anchor: { k: 'after-header' },
            home: 'auto',
            by: 'toy-loader',
          }),
        })
        ctx.rewrites.placeholder({
          range: { start: at + 'wrap('.length, end: at + 'wrap(0'.length },
          body: [{ k: 'text', parts: ['() => ', { sym: load.sym }, '()'] }],
          scope: 'all-outputs',
          by: 'toy-loader',
        })
      },
    }
    const host = new MemoryHost({
      files: {
        '/app/mod.ts': dedent(`
          const x = wrap(0)
          export const fn = lazy(() => x)
        `),
      },
    })
    const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
    const out = async (id: string) =>
      (await host.compile(id, [toyLoader, toyLazy], { env }))?.code ?? ''
    const r = {
      env: await out('/app/mod.ts'),
      lazy: await out('/app/mod.ts?tss-serverfn-handler'),
    }
    expect(r.env).not.toContain('const x')
    expect(r.lazy).toContain('const x = wrap(() => tsrLoad())')
    expect(imports(r.lazy, 'tsrLoad')).toBe(true)
  })
})
