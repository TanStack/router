import { describe, expect, it } from 'vitest'
import { walk } from 'yuku'
import {
  EMPTY_RECOGNIZER,
  parseModule,
  unwrapExpression,
} from '../src/compiler'
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
import type { Node } from 'yuku'
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
    extractExports?: boolean
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
      extractExports: opts.extractExports,
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

  // the same rule for a `<Hydrate>` boundary: its chunk cannot assign the
  // exported `let` the module keeps for its importers, so the boundary
  // stays in place, as Start's planner keeps it (and reports it) on the
  // core's `hydrate-writer` fallback
  it.each(['build', 'dev'] as const)(
    'keeps a <Hydrate> boundary whose children assign an exported let in place (hydrate-writer, %s)',
    async (mode) => {
      const code = dedent(`
        import { Hydrate } from 'toy-start'
        export let count = 0
        export function Page() { return <Hydrate><button onClick={() => count++}>{count}</button></Hydrate> }
      `)
      const host = new MemoryHost({ files: { '/app/mod.tsx': code } })
      const out = await host.compile('/app/mod.tsx', [toyHydratePlanner()], {
        env: envInfo({ mode }),
      })
      expect(out!.facts.planners['toy-hydrate']).toEqual({
        kept: { h0: 'hydrate-writer' },
      })
      expect(out!.code).toContain(
        'export let count = 0\nexport function Page() { return <Hydrate><button onClick={() => count++}>{count}</button></Hydrate> }',
      )
      expect(out!.code).not.toContain('tss-hydrate')
    },
  )

  // the same rule for a component declared on its own: a top-level writer
  // joins the binding it writes, which the route module keeps for its
  // other reader, so the option would only re-export it from there
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
      const r = await split(code)
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: 'shared-writer' },
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
    const r = await split(code)
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { component: 'shared-writer' },
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

  it('falls back for the second of two chunks writing one binding (multi-writer)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let renders = 0
      export const Route = createFileRoute('/')({
        component: () => { renders++; return renders },
        pendingComponent: () => { renders++; return renders },
      })
    `)
    const r = await split(code, { keys: ['component', 'pendingComponent'] })
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { pendingComponent: 'multi-writer' },
    })
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
    expect(r.chunks.component).toContain(
      "import { Route } from '/app/route.tsx'",
    )
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
    expect(r.chunks.component).toContain("import { re } from '/app/route.tsx'")
    expect(r.chunks.errorComponent).toContain(
      "import { re } from '/app/route.tsx'",
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
          ctx.renameRefs(sym, { sym: next.sym }, 'toy-rename')
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

// R149, extended (user + architect): an extracted export's module is a
// destination like a chunk. A statement whose bindings all go there follows
// into it, and an exported declaration with effects is extracted like any
// other; the module stays flagged side-effect free, so it runs when a chunk
// (or another importer) uses the export. In dev nothing is extracted: all of
// it stays in the route module as written.
describe("an extracted export's module is a destination", () => {
  const route = (decls: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore, register, applyOverrides, plugin } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        component: () => [flags.beta, store.value, list.length],
      })
    `)
  const decls =
    'export const flags = { beta: false }\napplyOverrides(flags)\nexport const store = createStore()\nregister(store)\nexport const list = []\nlist.push(plugin())'
  async function compile(mode: 'build' | 'dev', type: 'client' | 'server') {
    const host = new MemoryHost({ files: { '/app/route.tsx': route(decls) } })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = {
      env: envInfo(
        type === 'server' ? { name: 'ssr', type: 'server', mode } : { mode },
      ),
    }
    const out = await host.compile('/app/route.tsx', planners, env)
    const at = async (id: string) =>
      (await host.compile(id, planners, env))?.code ?? ''
    return {
      env: out?.code ?? '',
      diagnostics: (out?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      ),
      chunk: await at('/app/route.tsx?tsr-split=component'),
      module: (name: string) => at(`/app/route.tsx?tsr-split=export---${name}`),
    }
  }

  it.each(['client', 'server'] as const)(
    'moves a statement using only an export, and an export with effects, into their modules (%s build)',
    async (type) => {
      const r = await compile('build', type)
      expect(r.diagnostics).toEqual([])
      for (const line of [
        'applyOverrides(flags)',
        'createStore()',
        'register(store)',
        'list.push(plugin())',
      ]) {
        expect(r.env).not.toContain(line)
        expect(r.chunk).not.toContain(line)
      }
      expect(await r.module('flags')).toContain(
        'const flags = { beta: false }\napplyOverrides(flags)',
      )
      // (a follower of an export with effects of its own too)
      expect(await r.module('store')).toContain(
        'const store = createStore()\nregister(store)',
      )
      expect(await r.module('list')).toContain(
        'const list = []\nlist.push(plugin())',
      )
      // the chunk imports them (one instance of each effect)
      for (const name of ['flags', 'store', 'list']) {
        expect(r.chunk).toContain(`?tsr-split=export---${name}`)
      }
    },
  )

  // recheck ruling B (R150): an export with effects that the file also
  // writes with an effect of its own leaves with that statement
  it.each([
    ['an effect of its own', 'client.v = track(9)'],
    ['a pure value', 'client.v = 9'],
  ])(
    'extracts an export with effects the file also writes with %s, with the statement',
    async (_, write) => {
      const host = new MemoryHost({
        files: {
          '/app/route.tsx': dedent(`
            import { createFileRoute } from 'toy-router'
            import { box, track } from './lib'
            export const client = box(1)
            ${write}
            export const Route = createFileRoute('/')({ component: () => client })
          `),
        },
      })
      const planners = [
        toySplitPlanner({ keys: ['component'], extractExports: true }),
      ]
      const env = { env: envInfo({ mode: 'build' }) }
      const out = await host.compile('/app/route.tsx', planners, env)
      expect(out?.code).not.toContain(write)
      expect(out?.diagnostics).toEqual([])
      const module = await host.compile(
        '/app/route.tsx?tsr-split=export---client',
        planners,
        env,
      )
      expect(module?.code).toContain(`const client = box(1)\n${write}`)
    },
  )

  // recheck ruling A (R150): an export's module serves the chunk that reads
  // the export, so a statement using the export and a binding of that
  // chunk, and that binding, go into it (m14); likewise a declaration with
  // a write of its own reading an extracted export (y11)
  it.each([
    [
      'a statement writing it a binding of its reader',
      'export const flags = { beta: false }\nconst extra = make()\nflags.extra = extra',
      '() => [flags, extra]',
      'flags',
    ],
    [
      'a declaration with a write of its own reading it',
      'export const logger = make()\nconst client = wrap(logger)\nclient.v = track(2)',
      '() => client',
      'logger',
    ],
  ])("puts %s into the export's module", async (_, decls, component, name) => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
            import { createFileRoute } from 'toy-router'
            import { make, wrap, track } from './lib'
            ${decls.split('\n').join('\n            ')}
            export const Route = createFileRoute('/')({ component: ${component} })
          `),
      },
    })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    expect(out?.diagnostics).toEqual([])
    expect(out?.code).not.toContain('make()')
    const module = await host.compile(
      `/app/route.tsx?tsr-split=export---${name}`,
      planners,
      env,
    )
    expect(module?.code).toContain(decls.replace('export const', 'const'))
  })

  // (a member that comes to read, at load, an export the route module keeps
  // once that export's extraction is cancelled leaves the module: else the
  // module reads the route module as it evaluates; placement-exec seed
  // 10112)
  it("keeps a binding of the export's module that reads an export the route module comes to keep", async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { snap } from './lib'
          const on = true
          const F0 = () => 2
          export const r2 = 'p' in F0
          const r3 = snap(r2)
          const l5 = on ? F0 : null
          F0.v = [12]
          export const Route = createFileRoute('/')({
            loader: () => r3,
            component: () => [r2, r3, l5, r9],
          })
          export const r9 = [r3]
        `),
      },
    })
    const planners = [
      toySplitPlanner({ keys: ['component', 'loader'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    expect(out?.code).toContain('const r3 = snap(r2)')
    expect(out?.code).toContain('export const r9 = [r3]')
    // the export the rest stays for is reported at its own cause, though the
    // route module evaluates it (for `r3`, kept because of it)
    const r2 = (out?.diagnostics ?? []).filter((d) =>
      d.message.includes('The export `r2`'),
    )
    expect(r2).toMatchObject([{ code: 'eager-export:state' }])
    expect(r2[0]!.message).toContain(
      'stays in the route module because it uses `F0` when it loads, and the route module writes `F0` then (line 8), so it loads with the route module instead of with that code. Move it, `F0`, `on`, `r3`, `l5` and the statements writing them when the module loads to their own module and import them from there.',
    )
    // the fix: `F0`, its write, `r2` and what reads `F0` before the write
    // (`r3` hands `r2` to a call, `l5` names `F0`) with what that reads
    // (`on`) in a module of their own
    const fixed = new MemoryHost({
      files: {
        '/app/own.ts': dedent(`
          import { snap } from './lib'
          const on = true
          const F0 = () => 2
          export const r2 = 'p' in F0
          export const r3 = snap(r2)
          export const l5 = on ? F0 : null
          F0.v = [12]
        `),
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { l5, r2, r3 } from './own'
          export const Route = createFileRoute('/')({
            loader: () => r3,
            component: () => [r2, r3, l5, r9],
          })
          export const r9 = [r3]
        `),
      },
    })
    const f = await fixed.compile('/app/route.tsx', planners, env)
    expect(f?.diagnostics.map((d) => d.message).join('\n')).not.toMatch(
      /`r2`|`F0`/,
    )
  })

  // (a member a declaration pinned in the route module reads at load stays
  // there with it: in the export's module, its later write would run before
  // that read; placement-exec seed 12263)
  it("keeps a binding of the export's module that a declaration the route module keeps reads at load", async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { box } from './lib'
          const h6 = [box(2)]
          const r8 = h6[0].v
          export function W13() { h6[0].v = 4 }
          h6[0].v = 17
          export const Route = createFileRoute('/')({
            loader: () => W13(),
            component: () => r8,
          })
        `),
      },
    })
    const planners = [
      toySplitPlanner({ keys: ['component', 'loader'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    expect(out?.code).toContain(
      'const h6 = [box(2)]\nconst r8 = h6[0].v\nh6[0].v = 17',
    )
  })

  // round tools class B (placement-exec seeds 1112264, 1612539; router
  // planner 1300879, 1600380): a member of one export's module reading an
  // object before a later write that the object's own module makes (which
  // the member's module imports, so it evaluates first) is ordered against
  // it (O): it stays, and with it what reads it and the object; reported
  // once, at the member, naming the write (the export reading it is its
  // cascade)
  it("keeps a member reading an exported object before a later write of the object's module", async () => {
    const source = dedent(`
      import { createFileRoute } from 'toy-router'
      export const o0 = { v: 1 }
      const r2 = o0.p
      o0.p = 6
      export const r13 = [r2]
      export const Route = createFileRoute('/')({ component: () => [r2, r13] })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': source } })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    expect(out?.code).toContain(
      'export const o0 = { v: 1 }\nconst r2 = o0.p\no0.p = 6\nexport const r13 = [r2]',
    )
    expect(out?.diagnostics).toMatchObject([
      {
        code: 'eager-split:state',
        range: { start: source.indexOf('r2 = o0.p') },
      },
    ])
    expect(out!.diagnostics[0]!.message).toBe(
      '[tanstack-router] `r2` in /app/route.tsx stays in the route module because it uses `o0` when the module loads, and the module writes `o0` then (line 4); move `r2`, `o0` and the statements writing them when the module loads to their own module, so `r2` can load with the split `component`.',
    )
  })

  // round tools class C (fuzz seeds 6104927, 6407720, 6510105, 6518119;
  // toy seed 1409092): a statement using an export and a binding the
  // chunk takes with its write at load would read that binding in the
  // export's module, which may evaluate before the chunk (O): it stays,
  // keeping both (no module serves both, R149), reported at each
  it("keeps a statement using an export and a binding a chunk takes with its write at load out of the export's module", async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          export function Ex2() { return fmt(Comp) }
          let l4 = fmt(Comp)
          l4 = log('T2', l4)
          async function f5(x) { return fmt(x, l4) }
          log('T5', l4, Ex2)
          const P8 = () => [fmt(l3), Ex2()]
          export const Route = createFileRoute('/')({ component: () => fmt(P8, f5) })
        `),
      },
    })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const out = await host.compile('/app/route.tsx', planners, env)
    expect(out?.code).toContain(
      "export function Ex2() { return fmt(Comp) }\nlet l4 = fmt(Comp)\nl4 = log('T2', l4)\nlog('T5', l4, Ex2)",
    )
    const module = await host.compile(
      '/app/route.tsx?tsr-split=export---Ex2',
      planners,
      env,
    )
    expect(module?.code).not.toContain('log(')
    const kept = out?.diagnostics ?? []
    expect(kept.map((d) => d.code)).toEqual([
      'eager-split:written',
      'eager-split:written',
    ])
    expect(kept[0]!.message).toContain(
      '`Ex2` in /app/route.tsx stays in the route module because the statement on line 6, which uses it, stays there: it also uses `l4`, which the split `component` uses',
    )
    expect(kept[1]!.message).toContain(
      '`l4` in /app/route.tsx stays in the route module because the statement on line 6, which uses it, stays there: it also uses `Ex2`, which the split `component` uses',
    )
    // the move takes the statement writing `l4` when the module loads (left
    // behind, it would assign an import)
    expect(kept[0]!.message).toContain(
      '; move `Ex2`, `l4`, that statement and the statements writing them when the module loads to their own module, so `Ex2` can load',
    )
    expect(kept[1]!.message).toContain(
      '; move `l4`, `Ex2`, that statement and the statements writing them when the module loads to their own module, so `l4` can load',
    )
  })

  it('keeps all of it in the route module as written in dev', async () => {
    const r = await compile('dev', 'client')
    expect(r.diagnostics).toEqual([])
    expect(r.env).toContain(decls)
    expect(r.chunk).not.toContain('applyOverrides(flags)')
    expect(r.chunk).not.toContain('list.push(plugin())')
  })
})

// F-PEG-1 (phase-end fuzz seeds 1500250, 1504862, …): Start moves a server
// fn written in a function body to the module top level on the server, a
// binding the route module keeps that the body then reads. An extracted
// export's module evaluates before the route module's body (the route
// module re-exports it), so an export whose evaluation runs that body (it
// calls the function, or hands it or a function holding the server fn to
// a call) reads it before it exists: it stays, like one reading a kept
// binding in its own text (T); a cause only that build has is not reported
// (architect, like the extraction-identity rule), and a report never names
// a generated binding
describe('an export whose evaluation runs code reading what a planner moved to the top level', () => {
  /** Start's nested server fn, as a toy: a `hoisted(…)` call in a function moves to a module-level binding only the env module holds, which the function reads. */
  const hoistPlanner: Planner = {
    name: 'toy-hoist',
    tier: 1,
    gate: (t0) => t0.imports.some((i) => i.specifier === 'toy-start'),
    plan(ctx) {
      const { t1 } = ctx
      const imp = ctx.analysis.imports.find((i) => i.specifier === 'toy-start')
      const s = imp?.specifiers.find((x) => x.imported === 'hoisted')
      if (!s) {
        return
      }
      for (const ref of t1.refs.refsOf(s.local)) {
        const node = t1.nodeAt(ref.range.start)
        const call = node ? t1.parentOf(node) : null
        let inFunction = false
        for (let p = call; p !== null && !inFunction; p = t1.parentOf(p)) {
          inFunction = /Function/.test(p.type)
        }
        if (
          ref.ctx !== 'callee' ||
          call?.type !== 'CallExpression' ||
          !inFunction
        ) {
          continue
        }
        const region = ctx.region(
          { start: call.start, end: call.end },
          'nested-chain',
        )
        const name = ctx.names.alloc('tsrHoisted')
        const owner = ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: ['const ', { sym: name.sym }, ' = '] },
            { k: 'region', id: region },
            { k: 'text', parts: ['\n'] },
          ],
          declares: [name.sym],
          effectful: true,
          anchor: { k: 'after-header' },
          home: 'auto',
          by: 'toy-hoist',
        })
        ctx.rewrites.claim({
          region,
          owner,
          placeholder: [{ k: 'text', parts: [{ sym: name.sym }] }],
          by: 'toy-hoist',
        })
      }
    },
  }
  const compile = (value: string) =>
    compileRoute(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { hoisted } from 'toy-start'
        import { keep } from './lib'
        function Panel() {
          const inner = hoisted(1)
          return typeof inner
        }
        function Plain() {
          return 'plain'
        }
        export const x = ${value}
        export const y = [Plain()]
        export const Route = createFileRoute('/')({ component: () => [x, y] })
      `),
    )
  async function compileRoute(code: string) {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': code,
        '/app/lib.ts':
          'export const keep = <T,>(v: T): T => v\nexport const make = () => ({})\n',
      },
    })
    const planners = [
      hoistPlanner,
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const main = await host.compile('/app/route.tsx', planners, env)
    const at = async (id: string) =>
      (await host.compile(id, planners, env))?.code ?? ''
    return {
      env: main?.code ?? '',
      kept: (main?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-export'),
      ),
      chunk: await at('/app/route.tsx?tsr-split=component'),
      module: (name: string) => at(`/app/route.tsx?tsr-split=export---${name}`),
    }
  }

  it.each([
    ['calls the function', '[Panel()]'],
    ['hands the function to a call', 'keep(Panel)'],
    [
      'hands a function holding the call to a call',
      'keep(() => typeof hoisted(2))',
    ],
    // (kept before too, the report naming the generated binding)
    ['runs a function holding the call at once', '(() => typeof hoisted(2))()'],
  ])('stays when it %s', async (_, value) => {
    const r = await compile(value)
    expect(r.env).toMatch(/^export const x = /m)
    expect(await r.module('x')).not.toContain('const x')
    expect(r.chunk).toMatch(
      /import \{[^}]*\bx\b[^}]*\} from '\/app\/route\.tsx'/,
    )
    // (a control: one running nothing the planner moved leaves)
    expect(await r.module('y')).toContain('const y = [Plain()]')
    expect(r.kept).toEqual([])
  })

  // the source binding is reported, the moved one never named: the body
  // reads the moved binding first
  it('reports a binding of the source the route module keeps that the same evaluation reads', async () => {
    const r = await compileRoute(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { hoisted } from 'toy-start'
        import { make } from './lib'
        const shared = make()
        function Panel() {
          const inner = hoisted(1)
          return [typeof inner, shared]
        }
        export const x = [Panel()]
        export const Route = createFileRoute('/')({
          loader: () => shared,
          component: () => x,
        })
      `),
    )
    expect(r.env).toMatch(/^export const x = /m)
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0]!.code).toBe('eager-export:reads')
    expect(r.kept[0]!.message).toContain('`shared`')
    expect(r.kept[0]!.message).not.toContain('tsrHoisted')
  })

  // (seed 1514297's shape: unused code following the function into its
  // module was put back each round after leaving it for that read)
  it('keeps unused code handing an extracted function that holds the call to a call in the route module, with the function', async () => {
    const r = await compileRoute(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { hoisted } from 'toy-start'
        import { keep } from './lib'
        function Panel() {
          const inner = hoisted(1)
          return typeof inner
        }
        export { Panel as Alias }
        const unused = keep(Panel)
        export const Route = createFileRoute('/')({ component: Panel })
      `),
    )
    expect(r.env).toContain('const unused = keep(Panel)')
    expect(r.env).toContain('function Panel()')
    expect(await r.module('Alias')).not.toContain('Panel')
    expect(r.chunk).toMatch(
      /import \{[^}]*\bAlias\b[^}]*\} from '\/app\/route\.tsx'/,
    )
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
        `/app/route.tsx?tsr-split=export---${name}`,
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
      "export { Card } from '/app/route.tsx?tsr-split=export---Card'",
    )
    expect(r.chunk).not.toContain('export---Card')
    expect(r.chunk).toContain("import { heavy } from './heavy'")
    expect(r.chunk).toContain('function Card() { return heavy() }')
    expect(r.diagnostics).toEqual([])
    const e = await r.extracted('Card')
    expect(e?.code).toContain("import { heavy } from './heavy'")
    expect(e?.code).toContain('function Card() { return heavy() }')
    expect(e?.code).not.toContain('export function Card')
    expect(e?.code).toContain('export { Card }')
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).not.toContain('const config')
    expect(e?.code).toContain("import { config } from '/app/route.tsx'")
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain('const SIZE = 3')
    expect(e?.code).toContain('const Page = { size: SIZE, render: () => SIZE }')
    expect(e?.code).toContain('export { Page }')
    expect(e?.code).not.toContain("from '/app/route.tsx'")
  })

  // (effects have no order of their own, R146: it leaves for the module
  // of the export reading it, R150)
  it('moves an effectful declaration only an extracted export needs into its module, past an effect', async () => {
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
    expect(r.env).not.toContain("mark('page')")
    const e = await r.extracted('Page')
    expect(e?.code).toContain("const first = mark('page')")
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
    // (the module is named after the cluster's first export)
    expect(r.env).toContain(
      "export { theme, setTheme } from '/app/route.tsx?tsr-split=export---theme'",
    )
    expect(r.env).not.toContain('let theme')
    expect(r.env).not.toContain('const setTheme')
    const e = await r.extracted('theme')
    expect(e?.code).toContain("let theme = 'light'")
    expect(e?.code).toContain('const setTheme = (t) => { theme = t }')
    expect(e?.code).toContain('export { theme, setTheme }')
    expect(r.chunk).toContain(
      "import { theme } from '/app/route.tsx?tsr-split=export---theme'",
    )
  })

  // A unit assigning a binding is in its cluster (a setter, a statement
  // at load), so an exported `let` leaves with every writer, whether or
  // not the writer is exported (R150): the route module re-exports the live
  // binding and the chunk imports the setter from the same module.
  it.each([
    ['an unexported setter', 'function setMode(m) { mode = m }', 'setMode'],
    ['a statement assigning it at load', "mode = 'b'", null],
  ])('extracts an exported let with %s', async (_name, writer, imported) => {
    const code = dedent(`
        import { createFileRoute } from 'toy-router'
        export let mode = 'a'
        ${writer}
        function Page() { ${imported === null ? '' : `${imported}('c'); `}return mode }
        export const Route = createFileRoute('/')({ component: Page })
      `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { mode } from '/app/route.tsx?tsr-split=export---mode'",
    )
    expect(r.env).not.toContain('let mode')
    expect(r.env).not.toContain(writer)
    const e = await r.extracted('mode')
    expect(e?.code).toContain("let mode = 'a'")
    expect(e?.code).toContain(writer)
    expect(r.chunk).toContain(
      `import { ${imported === null ? 'mode' : `mode, ${imported}`} } from '/app/route.tsx?tsr-split=export---mode'`,
    )
    expect(r.diagnostics).toEqual([])
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
      "export { hits } from '/app/route.tsx?tsr-split=export---hits'",
    )
    expect(out!.code).toContain('export const bump = tsrStub()')
    expect(chunk!.code).toContain('let hits = 0')
    expect(
      out!.diagnostics.filter((d) => d.code?.startsWith('eager-')),
    ).toEqual([])
    // the server keeps the write: `hits` leaves with its writer, one
    // module holding both (every writer of `hits` is in its module)
    const env = {
      env: envInfo({ name: 'ssr', type: 'server', mode: 'build' }),
    }
    const server = await host.compile('/app/route.tsx', planners, env)
    expect(server!.code).toContain(
      "export { hits, bump } from '/app/route.tsx?tsr-split=export---hits'",
    )
    expect(server!.code).not.toContain('hits++')
    expect(server!.diagnostics).toEqual([])
    const module = await host.compile(
      '/app/route.tsx?tsr-split=export---hits',
      planners,
      env,
    )
    expect(module!.code).toContain('let hits = 0')
    expect(module!.code).toContain('hits++')
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    // the chunk copies `Page` and imports `Card` from the route module
    expect(r.chunk).not.toContain('export---Page')
    expect(r.chunk).toContain("import { Card } from '/app/route.tsx'")
    expect(r.chunk).toContain('function Page() { return Card() }')
    expect(r.chunk).toContain('const TsrSplitComponent = Page')
    expect(r.chunk).not.toContain('helper')
    // `Card` stays in the route module because the loader reads it: it
    // would stay there without the chunk, so that is no news (R101)
    expect(r.diagnostics).toEqual([])
    const page = await r.extracted('Page')
    expect(page?.code).toContain("import { Card } from '/app/route.tsx'")
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
      'derived:/app/route.tsx?tsr-split=export---Page',
      'env',
    ])
    expect((await r.extracted('Card'))?.code).toBe('export {}\n')
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
      "export { Card as View, Card as default } from '/app/route.tsx?tsr-split=export---View'",
    )
  })

  // An export list (or `export default x`) of bindings of one cluster
  // renders as the re-export glue: every binding it exports leaves with the
  // cluster, whatever output each one was offered.
  it.each([
    [
      'a destructuring exported in a list',
      'const { Page, Other } = views\nexport { Page, Other }',
      ['Other', 'Page'],
    ],
    [
      'a destructuring exported in a list and by default',
      'const { Page, Other } = views\nexport { Other }\nexport default Page',
      ['Other', 'Page as default'],
    ],
    [
      'a destructuring exported in a list under other names and by default',
      'const { Page, Other } = views\nexport { Other as O, Page as P }\nexport default Page',
      ['Other as O', 'Page as P', 'Page as default'],
    ],
    [
      'a `let` and the function writing it exported in a list',
      'let Other = 0\nfunction Page() { Other++; return Other }\nexport { Other, Page }',
      ['Other', 'Page'],
    ],
  ])('re-exports every binding of %s', async (_, declarations, names) => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const views = { Page: () => 'page', Other: () => 'other' }
      ${declarations.replaceAll('\n', '\n      ')}
      export const Route = createFileRoute('/')({ component: () => Page() })
    `)
    const r = await extract(code)
    const reexported = r.env.match(/export \{ ([^}]*) \} from '([^']+)'/)
    expect(reexported![1]!.split(', ').sort()).toEqual(names)
    // the companions render as that glue only
    expect(r.env).not.toMatch(/^export (default |\{[^}]*\}$)/m)
    const e = await r.host.compile(
      reexported![2]!,
      [toySplitPlanner({ keys: ['component'], extractExports: true })],
      build,
    )
    expect(e?.code).toMatch(/export \{ (Other, Page|Page, Other) \}/)
  })

  // `export default count` holds the value `count` has when it runs: of a
  // reassigned `count` it is no re-export of the binding, and no name a
  // chunk can import the binding by.
  it('keeps `export default x` of a reassigned `x` next to an extracted function writing it', async () => {
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
    expect(r.env).not.toContain('export---')
  })

  it('imports a reassigned binding the env module also exports by default under a name of its own', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let count = 0
      export function bump() { count++ }
      export default count
      export const Route = createFileRoute('/')({
        loader: () => count,
        component: () => count,
      })
    `)
    const r = await extract(code)
    expect(r.env).toContain('export default count')
    expect(r.env).toContain('export { count }')
    expect(r.chunk).toContain("import { count } from '/app/route.tsx'")
  })

  // Above the `var` declaring `x`, `export default x` holds `undefined` (the
  // initialiser runs later): no re-export of the binding either, and no
  // name a chunk can import the binding by. A hoisted function has its
  // value already: that export is its binding.
  it.each([
    ['the env module reads it too', 'loader: () => items, '],
    ['only the chunk reads it', ''],
  ])(
    'imports a `var` the module exports by default above it under a name of its own (%s)',
    async (_, loader) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        export default items
        var items = [1]
        export const Route = createFileRoute('/')({ ${loader}component: () => items })
      `)
      const r = await extract(code)
      expect(r.env).toContain('export default items\nvar items = [1]')
      expect(r.env).toContain('export { items }')
      expect(r.chunk).toContain("import { items } from '/app/route.tsx'")
    },
  )

  // Any declaration of the binding counts: a later `var` changes it, whatever
  // declared it first (a type, another `var`).
  it.each([
    ['var items = [1]\nexport default items\nvar items = [2]'],
    ['var items\nexport default items\nvar items = [2]'],
    ['interface items { a: 1 }\nexport default items\nvar items = [2]'],
    ['var items = [1]\nexport default items\nfor (var items of [[2]]) {}'],
  ])(
    'imports a binding a later `var` changes under a name of its own: %s',
    async (declarations) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      ${declarations.replaceAll('\n', '\n      ')}
      export const Route = createFileRoute('/')({ loader: () => items, component: () => items })
    `)
      const r = await extract(code)
      expect(r.env).toContain('export default items')
      expect(r.env).toContain('export { items }')
      expect(r.chunk).toContain("import { items } from '/app/route.tsx'")
    },
  )

  // Type declarations give no value: the function's is there before the
  // statement runs.
  it.each([
    ['function Page(a: string): string\nfunction Page(a: any) { return a }'],
    ['interface Page { a: 1 }\nfunction Page() { return 1 }'],
  ])(
    'extracts a function declared below `export default` with types: %s',
    async (declarations) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export default Page
      ${declarations.replaceAll('\n', '\n      ')}
      export const Route = createFileRoute('/')({ component: () => Page() })
    `)
      const r = await extract(code)
      expect(r.env).not.toContain('function Page')
      expect(r.env).toMatch(
        /export \{ Page as default \} from '.*export---default'/,
      )
    },
  )

  it('extracts a function the module exports by default above its declaration', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export default Page
      function Page() { return 'page' }
      export const Route = createFileRoute('/')({ component: () => Page() })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('function Page')
    expect(r.env).toMatch(
      /export \{ Page as default \} from '.*export---default'/,
    )
  })

  // `export * from …` may export any name: the glue export names are the
  // compiler's own, so the module's importers still get the re-exported one.
  it.each([
    ["export * from './shared'", 'tsr$config'],
    // a named export and a type-only one: their names are known
    ["export * as shared from './shared'", 'config'],
    ["export type * from './shared'", 'config'],
  ])(
    'exports glue under a name of its own in a module re-exporting with `export *` (`%s`: `%s`)',
    async (reexport, glue) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      ${reexport}
      const config = { title: 'local' }
      export const Route = createFileRoute('/')({
        loader: () => config.title,
        component: () => config.title,
      })
    `)
      const r = await extract(code)
      expect(r.env).toContain(
        glue === 'config'
          ? 'export { config }'
          : `export { config as ${glue} }`,
      )
      expect(r.chunk).toContain(
        glue === 'config'
          ? "import { config } from '/app/route.tsx'"
          : `import { ${glue} as config } from '/app/route.tsx'`,
      )
    },
  )

  // A planner can name a binding's glue export ahead (route HMR lists it):
  // `glueExportName` gives the name freeze allocates, renamed (`Config$1`)
  // when another export takes the binding's name.
  it('names a glue export ahead as freeze allocates it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export type Config = { title: string }
      const Config = { title: 'cfg' }
      const label = { text: 'label' }
      export const Route = createFileRoute('/')({
        loader: () => Config.title + label.text,
        component: () => Config.title + label.text,
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [toySplitPlanner({ glueNames: ['Config', 'label'] })]
    const env = await host.compile('/app/route.tsx', planners, build)
    expect(env?.code).toContain('export { Config as Config$1, label }')
    expect(env?.code).toContain(
      'export const glueNames = ["Config$1", "label"]',
    )
  })

  // A planner whose glue joins the exports of a module user code imports
  // tags them with the file (`tagGlueExports`): an `export *` barrel of two
  // such modules sees no generated name twice. The derived output imports
  // the tagged names; `glueExportName` names them ahead the same way.
  it('tags glue exports when a planner asks, in the env module and the derived output', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const store = new Map([['k', 'v']])
      export const Route = createFileRoute('/')({
        loader: () => store.get('k'),
        component: () => store.get('k'),
      })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toySplitPlanner({ glueNames: ['store'], glueTag: 'f00d' }),
    ]
    const env = await host.compile('/app/route.tsx', planners, build)
    expect(env?.code).toContain('export { store as store$f00d }')
    expect(env?.code).toContain('export const glueNames = ["store$f00d"]')
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      build,
    )
    expect(chunk?.code).toContain(
      "import { store$f00d as store } from '/app/route.tsx'",
    )
  })

  it('puts exports that read each other in one module and keeps a one-way read apart', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export class Z { o() { return A } }
      export class A extends Z {}
      export class Other extends A {}
      function Page() { return [new A(), new Other()] }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { Z, A } from '/app/route.tsx?tsr-split=export---Z'",
    )
    expect(r.env).toContain(
      "export { Other } from '/app/route.tsx?tsr-split=export---Other'",
    )
    const z = (await r.extracted('Z'))!.code
    expect(z.indexOf('class Z')).toBeGreaterThan(-1)
    expect(z.indexOf('class A')).toBeGreaterThan(z.indexOf('class Z'))
    expect(z).not.toContain('import ')
    const other = (await r.extracted('Other'))!.code
    expect(other).toContain(
      "import { A } from '/app/route.tsx?tsr-split=export---Z'",
    )
  })

  it('lets a chunk copy a cycle of functions, which the route file re-exports from one module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export function F() { return G }
      export function G() { return F }
      function Page() { return [F, G] }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { F, G } from '/app/route.tsx?tsr-split=export---F'",
    )
    expect(r.chunk).toContain('function F()')
    expect(r.chunk).toContain('function G()')
    expect(r.chunk).not.toContain('export---')
  })

  it('imports one way between two cycles', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export class A1 { o() { return A2 } }
      export class A2 extends A1 {}
      export class B1 extends A2 { o() { return B2 } }
      export class B2 extends B1 {}
      function Page() { return [new A1(), new B2()] }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    const b = (await r.extracted('B1'))!.code
    expect(b).toContain(
      "import { A2 } from '/app/route.tsx?tsr-split=export---A1'",
    )
    const a = (await r.extracted('A1'))!.code
    expect(a).not.toContain('export---B1')
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
      "export { Card as 'card-view' } from '/app/route.tsx?tsr-split=export---card%2dview'",
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
    expect(r.env).not.toContain('export---')
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
      "export { bump } from '/app/route.tsx?tsr-split=export---bump'",
    )
    expect(r.chunk).toContain(
      "import { clicks } from '/app/route.tsx?tsr-split=export---bump'",
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
    expect(r.chunk).toContain("import { id } from '/app/route.tsx'")
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
    expect(r.env).not.toContain('export---')
  })

  it('does not extract a declaration reading what an effectful declaration a chunk needs reads', async () => {
    // `store` is only read by the chunk and by code the env planner erases:
    // it moves (no order rule), and the chunk imports `Shared` from the env
    // module, which keeps it for `Page`
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
    expect(env).not.toContain('const store = see(Shared)')
    expect(env).toContain('export const Page = Shared')
    expect(env).not.toContain('export---')
  })

  it('puts an effectful declaration an extracted export reads in its module, which both chunks import (one instance)', async () => {
    // (recheck ruling A: `theme` is the export module's; `Card` is then
    // imported, not copied, so both chunks read the one `theme`)
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
    expect(r.env).not.toContain('createTheme()')
    expect(r.env).toContain(
      "export { Card } from '/app/route.tsx?tsr-split=export---Card'",
    )
    expect(r.chunk).toContain(
      "import { Card } from '/app/route.tsx?tsr-split=export---Card'",
    )
    expect(r.chunk).not.toContain('function Card')
    const e = await r.extracted('Card')
    expect(e?.code).toContain(
      'const theme = createTheme()\nfunction Card() { return theme.card }',
    )
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

  // (an export observing the state at load stays in the route module: the
  // F1-2 tests of "what an evaluation runs")
  it('imports a cluster declaring state from the extracted module instead of copying it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 0
      export function inc() { n++ }
      export const read = () => n
      function Page() { inc(); return read() }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.chunk).toContain(
      "import { n, inc } from '/app/route.tsx?tsr-split=export---inc'",
    )
    expect(r.chunk).toContain('const read = () => n')
    expect(r.chunk).not.toContain('n++')
    expect(r.diagnostics).toEqual([])
  })

  // What a chunk copies (SPEC J2.4): the export and what it reaches that
  // exists nowhere else, every piece a function or a primitive nothing
  // writes. A value with an identity (a class, an object, a call result, a
  // regex) or a written binding in that closure makes the export
  // non-copyable: the chunk imports the extracted module, and the value
  // exists once.
  describe('what a chunk copies', () => {
    it('copies an exported function whose closure is functions, primitives and imports', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { heavy } from './heavy'
        const LIMIT = 3
        const label = (v: number) => v + LIMIT
        export function Card() { return label(heavy()) }
        function Page() { return Card() }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code)
      expect(r.env).not.toContain('function Card')
      expect(r.env).not.toContain('const label')
      expect(r.chunk).not.toContain('export---Card')
      expect(r.chunk).toContain("import { heavy } from './heavy'")
      expect(r.chunk).toContain('const LIMIT = 3')
      expect(r.chunk).toContain('const label = (v: number) => v + LIMIT')
      expect(r.chunk).toContain('function Card() { return label(heavy()) }')
    })

    it.each([
      ['a class', 'export class Model { static kind = 1 }', 'Model.kind'],
      ['an object literal', 'export const Model = { kind: 1 }', 'Model.kind'],
      ['an array literal', 'export const Model = [1]', 'Model.length'],
      [
        'an annotated call',
        "import { make } from './make'\nexport const Model = /* @__PURE__ */ make()",
        'Model.kind',
      ],
      ['a regex', 'export const Model = /m/', 'Model.source'],
      ['an enum', 'export enum Model { kind = 1 }', 'Model.kind'],
    ])(
      'imports an exported value with an identity from its extracted module instead of copying it: %s',
      async (_, declaration, read) => {
        const code = dedent(`
          import { createFileRoute } from 'toy-router'
          ${declaration.replaceAll('\n', '\n          ')}
          function Page() { return ${read} }
          export const Route = createFileRoute('/')({ component: Page })
        `)
        const r = await extract(code)
        expect(r.env).toContain(
          "export { Model } from '/app/route.tsx?tsr-split=export---Model'",
        )
        expect(r.chunk).toContain(
          "import { Model } from '/app/route.tsx?tsr-split=export---Model'",
        )
        expect(r.chunk).not.toMatch(/(class|const|enum) Model\b/)
        const e = await r.extracted('Model')
        expect(e?.code).toMatch(/(class|const|enum) Model\b/)
        expect(e?.code).toContain('export { Model }')
        expect(r.diagnostics).toEqual([])
      },
    )

    it('imports an exported function that reaches a written value instead of copying it; the value moves with it', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const state = { n: 0 }
        export function bump() { state.n++ }
        function Page() { bump(); return 'page' }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code)
      expect(r.env).not.toContain('const state')
      expect(r.env).not.toContain('function bump')
      expect(r.chunk).toContain(
        "import { bump } from '/app/route.tsx?tsr-split=export---bump'",
      )
      expect(r.chunk).not.toContain('state.n++')
      const e = await r.extracted('bump')
      expect(e?.code).toContain('const state = { n: 0 }')
      expect(e?.code).toContain('function bump() { state.n++ }')
      expect(r.diagnostics).toEqual([])
    })

    it('keeps a written value two extracted exports reach in the route module, one instance', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const listeners: Array<() => void> = []
        export function subscribe(fn: () => void) { listeners.push(fn) }
        export function emit() { listeners.forEach((fn) => fn()) }
        export const Route = createFileRoute('/')({
          component: () => subscribe(() => 1),
          errorComponent: () => emit(),
        })
      `)
      const r = await extract(code, ['component', 'errorComponent'])
      expect(r.env).toContain('const listeners: Array<() => void> = []')
      expect(r.env).toContain('export { listeners }')
      expect(r.env).toContain(
        "export { subscribe } from '/app/route.tsx?tsr-split=export---subscribe'",
      )
      expect(r.chunk).toContain(
        "import { subscribe } from '/app/route.tsx?tsr-split=export---subscribe'",
      )
      expect(r.chunk).not.toContain('listeners')
      const e = await r.extracted('subscribe')
      expect(e?.code).toContain("import { listeners } from '/app/route.tsx'")
      expect(e?.code).toContain(
        'function subscribe(fn: () => void) { listeners.push(fn) }',
      )
      expect(e?.code).not.toContain('const listeners')
      // what only split code needs and stays is reported (J2.8)
      expect(r.diagnostics).toMatchObject([
        {
          code: 'eager-split:shared',
          range: { start: code.indexOf('listeners') },
        },
      ])
      expect(r.diagnostics[0]!.message).toContain(
        'the module of the export `subscribe`',
      )
    })

    // (recheck ruling A: the export module holds it, one instance)
    it('puts a value with an identity an extracted module and a chunk both read in that module, one instance', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const styles = { card: 'c' }
        export function Card() { return styles.card }
        export const Route = createFileRoute('/')({
          component: () => Card() + styles.card,
        })
      `)
      const r = await extract(code)
      expect(r.env).not.toContain('const styles')
      expect(r.chunk).toContain(
        "import { styles, Card } from '/app/route.tsx?tsr-split=export---Card'",
      )
      expect(r.chunk).not.toContain('function Card')
      const e = await r.extracted('Card')
      expect(e?.code).toContain(
        "const styles = { card: 'c' }\nfunction Card() { return styles.card }",
      )
      expect(r.diagnostics).toEqual([])
    })

    it('in dev keeps a non-copied export in the route module and the chunk imports it, as in a build', async () => {
      const dev = { env: envInfo({ mode: 'dev' }) }
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const listeners: Array<() => void> = []
        export class Model {}
        export function subscribe(fn: () => void) { listeners.push(fn) }
        export const Route = createFileRoute('/')({
          component: () => subscribe(() => new Model()),
        })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.env).toContain('export class Model {}')
      expect(r.env).toContain('const listeners')
      expect(r.env).toContain('export function subscribe')
      expect(r.env).not.toContain('export---')
      expect(r.chunk).toContain(
        "import { Model, subscribe } from '/app/route.tsx'",
      )
      expect(r.chunk).not.toContain('class Model')
      expect(r.chunk).not.toContain('listeners')
    })
  })

  // What the copy never carries: another export (imported from its module
  // or copied under its own decision), an effectful cluster, an eager
  // reader of state and what the route module's own roots keep alive are
  // one instance by construction, so they do not stop the copy.
  describe('what a copy does not carry', () => {
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

    it('copies an exported component that reads the route', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        export function Page() { return Route.useLoaderData() }
        export const Route = createFileRoute('/')({ loader: () => 1, component: Page })
      `)
      const r = await extract(code)
      expect(r.chunk).not.toContain('export---Page')
      expect(r.chunk).toContain("import { Route } from '/app/route.tsx'")
      expect(r.chunk).toContain(
        'function Page() { return Route.useLoaderData() }',
      )
    })

    // (recheck ruling A: what it reads is its module's, so it is imported)
    it('imports an exported function reading an effectful binding whose initialiser reads an object, from a module holding both', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { createTheme } from './theme'
        const cfg = { dark: true }
        const theme = createTheme(cfg)
        export function Card() { return theme.card }
        export const Route = createFileRoute('/')({ component: () => Card() })
      `)
      const r = await extract(code)
      expect(r.env).not.toContain('createTheme(cfg)')
      expect(r.chunk).toContain(
        "import { Card } from '/app/route.tsx?tsr-split=export---Card'",
      )
      expect((await r.extracted('Card'))?.code).toContain(
        'const cfg = { dark: true }\nconst theme = createTheme(cfg)\nfunction Card() { return theme.card }',
      )
    })

    it('copies an exported function reading an object the route module keeps', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const styles = { card: 'c' }
        export function Card() { return styles.card }
        export const Route = createFileRoute('/')({
          loader: () => styles.card,
          component: () => Card(),
        })
      `)
      const r = await extract(code)
      expect(r.env).toContain("const styles = { card: 'c' }")
      expect(r.chunk).not.toContain('export---Card')
      expect(r.chunk).toContain("import { styles } from '/app/route.tsx'")
      expect(r.chunk).toContain('function Card() { return styles.card }')
      expect(r.diagnostics).toEqual([])
    })

    // The extracted module evaluates before the route module's body: a
    // function it calls then reads what the route module keeps too early.
    it.each([
      [
        'a pure call',
        'function build() { return { t: theme } }\nexport const config = /* @__PURE__ */ build()',
      ],
      [
        'a call of a function marked without side effects',
        '/* #__NO_SIDE_EFFECTS__ */ function build() { return { t: theme } }\nexport const config = build()',
      ],
      [
        'a copied helper called in a property',
        'const fmt = () => theme.dark\nexport const config = { dark: /* @__PURE__ */ fmt() }',
      ],
      [
        'a call through an alias',
        'function read() { return { t: theme } }\nconst alias = read\nexport const config = /* @__PURE__ */ alias()',
      ],
      [
        'a method of a local object',
        'const o = { m() { return { t: theme } } }\nexport const config = /* @__PURE__ */ o.m()',
      ],
      [
        'a function held in a local object',
        'function read() { return { t: theme } }\nconst o = { m: read }\nexport const config = /* @__PURE__ */ o.m()',
      ],
      [
        'a static method',
        'class B { static m() { return { t: theme } } }\nexport const config = /* @__PURE__ */ B.m()',
      ],
      [
        'call()',
        'function read() { return { t: theme } }\nexport const config = /* @__PURE__ */ read.call(null)',
      ],
      [
        'a sequence callee',
        'function read() { return { t: theme } }\nexport const config = /* @__PURE__ */ (0, read)()',
      ],
      [
        'a returned function',
        'function read() { return { t: theme } }\nfunction get() { return read }\nexport const config = /* @__PURE__ */ get()()',
      ],
      [
        'a function passed as an argument',
        'function read() { return { t: theme } }\nexport const config = /* @__PURE__ */ apply(read)',
      ],
      [
        'an arrow passed as an argument',
        'export const config = /* @__PURE__ */ apply(() => ({ t: theme }))',
      ],
      [
        'a constructor calling its parent',
        'class A { t = theme }\nclass B extends A { constructor() { super() } }\nexport const config = /* @__PURE__ */ new B()',
      ],
    ])(
      'keeps an export whose evaluation calls a function reading what the route module keeps (no TDZ): %s',
      async (_, declarations) => {
        const code = dedent(`
          import { createFileRoute } from 'toy-router'
          import { apply } from './rt'
          const theme = { dark: true }
          ${declarations.replaceAll('\n', '\n          ')}
          function Page() { return [config, theme.dark] }
          export const Route = createFileRoute('/')({
            loader: () => theme.dark,
            component: Page,
          })
        `)
        // (the loader keeps `theme`: an extracted module would read it
        // through the re-export cycle; without it, `theme` would go into
        // `config`'s module with it, recheck ruling A)
        const r = await extract(code)
        expect(r.env).toContain('export const config')
        expect(r.env).not.toContain('export---')
        expect(r.chunk).toContain("from '/app/route.tsx'")
        expect(r.diagnostics).toMatchObject([
          {
            code: 'eager-export:reads',
            range: { start: code.indexOf('config = ') },
          },
        ])
      },
    )

    it.each([
      [
        'a function and a namespace',
        'export function Label() { return 1 }\nexport namespace Label { export const size = 1 }',
      ],
      [
        'an enum in two declarations',
        'export enum Label { A = 1 }\nexport enum Label { B = 2 }',
      ],
    ])(
      'the route module re-exports a binding of %s once',
      async (_, declarations) => {
        const code = dedent(`
          import { createFileRoute } from 'toy-router'
          ${declarations.replaceAll('\n', '\n          ')}
          function Page() { return Label }
          export const Route = createFileRoute('/')({ component: Page })
        `)
        const r = await extract(code)
        expect(r.env).toContain('export { Label } from')
      },
    )

    // Reading a function is not calling it: only an evaluation that calls
    // something can run the function's body at load.
    it('extracts an export that holds a function reading what the route module keeps, without calling anything', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const theme = { dark: true }
        const read = () => theme.dark
        export const config = { read }
        function Page() { return [config, theme.dark] }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code)
      expect(r.env).toContain('export---config')
    })

    it('extracts an export that holds a function reading an effectful enum, read through a method at load, with the enum', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { track } from './rt'
        enum T { A = track('T') }
        const o = { m() { return T } }
        export const R = /* @__PURE__ */ o.m()
        function Page() { return R }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code)
      expect(r.env).not.toContain("track('T')")
      expect(r.env).toContain('export---R')
      const e = (await r.extracted('R'))?.code
      expect(e).toContain("enum T { A = track('T') }")
      expect(e).toContain('const R = /* @__PURE__ */ o.m()')
    })

    it.each([
      [
        'a constructor',
        'export function Model(this: any, x: number) { this.x = x }\nexport function isModel(v: unknown) { return v instanceof Model }',
        'isModel(new Model(1))',
      ],
      [
        'a sentinel',
        'export const Model = () => {}\nexport function isModel(v: unknown) { return v === Model }',
        'isModel(Model)',
      ],
      [
        'a prototype',
        'export function Model() {}\nexport function isModel(v: unknown) { return Object.getPrototypeOf(v) === Model.prototype }',
        'isModel(Model)',
      ],
      [
        'a case label',
        'export const Model = () => {}\nexport function isModel(v: unknown) { switch (v) { case Model: return true } return false }',
        'isModel(Model)',
      ],
      [
        'a switch value',
        'export const Model = () => {}\nexport function isModel(v: unknown) { switch (Model) { case v: return true } return false }',
        'isModel(Model)',
      ],
    ])(
      'imports an exported function whose identity is observed instead of copying it: %s',
      async (_, declarations, read) => {
        const code = dedent(`
          import { createFileRoute } from 'toy-router'
          ${declarations.replaceAll('\n', '\n          ')}
          function Page() { return ${read} }
          export const Route = createFileRoute('/')({ component: Page })
        `)
        const r = await extract(code)
        expect(r.chunk).toContain(
          "import { Model } from '/app/route.tsx?tsr-split=export---Model'",
        )
        expect(r.chunk).not.toMatch(/(function|const) Model\b/)
        const e = await r.extracted('isModel')
        expect(e?.code).toContain(
          "import { Model } from '/app/route.tsx?tsr-split=export---Model'",
        )
        expect(e?.code).not.toMatch(/(function|const) Model\b/)
      },
    )

    it('imports a copied export from its module in another extracted module, and copies it into the chunk', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        export function helper() { return 1 }
        export const config = { helper }
        function Page() { return config.helper() + helper() }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const r = await extract(code)
      expect(r.chunk).toContain('function helper() { return 1 }')
      expect(r.chunk).toContain(
        "import { config } from '/app/route.tsx?tsr-split=export---config'",
      )
      const e = await r.extracted('config')
      expect(e?.code).toContain(
        "import { helper } from '/app/route.tsx?tsr-split=export---helper'",
      )
      expect(e?.code).not.toContain('function helper')
      expect(e?.code).toContain('const config = { helper }')
    })

    it('duplicates a primitive constant whatever writes a member of it (nothing to observe)', async () => {
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

    it('keeps a written binding an extracted export reads and a split option writes in the route module', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let count = 0
        export function read() { return count }
        export const Route = createFileRoute('/')({
          component: () => read(),
          errorComponent: () => { count++; return count },
        })
      `)
      const r = await extract(code, ['component', 'errorComponent'])
      expect(r.env).toContain('let count = 0')
      expect(r.env).toContain('count++')
      expect(r.env).toContain('export { count }')
      // the chunk reads the one `count` of the route module (through its
      // copy of `read`, a function closure)
      expect(r.chunk).toContain("import { count } from '/app/route.tsx'")
      expect(r.chunk).not.toContain('let count')
      expect(r.chunk).not.toContain('count++')
      const e = await r.extracted('read')
      expect(e?.code).toContain("import { count } from '/app/route.tsx'")
      expect(e?.code).not.toContain('let count')
    })

    // An import only a server fn's handler reads is orphaned in the env
    // module (the handler is a stub there) and needed by the provider output
    // alone: it goes with the provider, not nowhere (the Start planner tests
    // caught a homes change that dropped it).
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
        toySplitPlanner({ keys: ['component'], extractExports: true }),
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

    // A chunk imports what the env module evaluates, so it reads what the env
    // module's tree keeps there: the handler the env output erased (reached
    // through `Route`'s loader) is no read of the chunk, and what only that
    // handler reads stays with the provider output.
    it('keeps what only an erased handler reads out of a chunk that reaches the server fn through the route', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { wrapServer } from 'toy-start'
        import { db } from './db'
        function helper() { return db.q() }
        const fn = wrapServer(() => helper())
        export const Route = createFileRoute('/')({
          loader: () => fn(),
          component: Page,
        })
        function Page() { return Route.useLoaderData() }
      `)
      const host = new MemoryHost({ files: { '/app/route.tsx': code } })
      const planners = [
        providerOutEnvPlanner(),
        toyProviderPlanner(),
        toySplitPlanner({ keys: ['component'] }),
      ]
      const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
      const main = await host.compile('/app/route.tsx', planners, { env })
      expect(main?.code).toContain('const fn = wrapServer(0)')
      expect(main?.code).not.toContain('helper')
      const chunk = await host.compile(
        '/app/route.tsx?tsr-split=component',
        planners,
        { env },
      )
      expect(chunk?.code).toContain('function Page()')
      expect(chunk?.code).not.toContain('helper')
      expect(chunk?.code).not.toContain("from './db'")
      const prov = await host.compile(
        '/app/route.tsx?tss-serverfn-split',
        planners,
        { env },
      )
      expect(prov?.code).toContain('function helper()')
      expect(prov?.code).toContain("import { db } from './db'")
    })

    // The two rules together: a cycle of exports only an erased handler reads
    // is nobody's chunk's need, and a chunk that reads it too shares one module
    // while the handler's own reads stay with the provider output.
    describe('a read cycle of exports behind a server fn the loader calls', () => {
      const code = (page: string) =>
        dedent(`
          import { createFileRoute } from 'toy-router'
          import { wrapServer } from 'toy-start'
          import { db } from './db'
          export class Z { o() { return A } }
          export class A extends Z {}
          function helper() { return db.q(new A()) }
          const fn = wrapServer(() => helper())
          export const Route = createFileRoute('/')({
            loader: () => fn(),
            component: Page,
          })
          function Page() { ${page} }
        `)
      const compileAll = async (source: string) => {
        const host = new MemoryHost({ files: { '/app/route.tsx': source } })
        const planners = [
          providerOutEnvPlanner(),
          toyProviderPlanner(),
          toySplitPlanner({ keys: ['component'], extractExports: true }),
        ]
        const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
        const of = async (query: string) =>
          (await host.compile(`/app/route.tsx${query}`, planners, { env }))
            ?.code
        return {
          main: await of(''),
          chunk: await of('?tsr-split=component'),
          provider: await of('?tss-serverfn-split'),
          extracted: await of('?tsr-split=export---Z'),
        }
      }

      it('stays out of a chunk that only reaches the server fn', async () => {
        const r = await compileAll(code('return Route.useLoaderData()'))
        expect(r.main).toContain('const fn = wrapServer(0)')
        expect(r.main).not.toContain('helper')
        expect(r.chunk).not.toContain('helper')
        expect(r.chunk).not.toContain('class A')
        expect(r.chunk).not.toContain("from './db'")
        expect(r.provider).toContain('function helper()')
        expect(r.provider).toContain("import { db } from './db'")
      })

      it('shares one module when the chunk reads it too', async () => {
        const r = await compileAll(
          code('return [new A(), Route.useLoaderData()]'),
        )
        expect(r.main).toContain(
          "export { Z, A } from '/app/route.tsx?tsr-split=export---Z'",
        )
        expect(r.main).not.toContain('helper')
        expect(r.extracted).toContain('class Z')
        expect(r.extracted).toContain('class A')
        expect(r.extracted).not.toContain('helper')
        expect(r.chunk).toContain(
          "import { A } from '/app/route.tsx?tsr-split=export---Z'",
        )
        expect(r.chunk).not.toContain('helper')
        expect(r.chunk).not.toContain("from './db'")
        expect(r.provider).toContain('function helper()')
      })
    })

    // A provider output copies what it reaches (another layer's instance):
    // it is no needer the identity rule counts, and no reason to keep a
    // cluster in the env module (the dev-time self-check threw here).
    it('homes a value an extracted export and a provider output share in the export module', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { wrapServer } from 'toy-start'
        const config = { a: 1 }
        export const wrapped = { config }
        export const fn = wrapServer(() => config)
        function Page() { return wrapped.config.a }
        export const Route = createFileRoute('/')({ component: Page })
      `)
      const host = new MemoryHost({ files: { '/app/route.tsx': code } })
      const planners = [
        providerOutEnvPlanner(),
        toyProviderPlanner(),
        toySplitPlanner({ keys: ['component'], extractExports: true }),
      ]
      const env = envInfo({ name: 'ssr', type: 'server', mode: 'build' })
      const main = await host.compile('/app/route.tsx', planners, { env })
      expect(main?.code).toContain('export const fn = wrapServer(0)')
      expect(main?.code).not.toContain('const config')
      expect(main?.code).toContain(
        "export { wrapped } from '/app/route.tsx?tsr-split=export---wrapped'",
      )
      const wrapped = await host.compile(
        '/app/route.tsx?tsr-split=export---wrapped',
        planners,
        { env },
      )
      expect(wrapped?.code).toContain('const config = { a: 1 }')
      expect(wrapped?.code).not.toContain("from '/app/route.tsx'")
      const prov = await host.compile(
        '/app/route.tsx?tss-serverfn-split',
        planners,
        { env },
      )
      expect(prov?.code).toContain('const config = { a: 1 }')
      expect(main?.diagnostics).toEqual([])
    })
  })

  // R101: an exported declaration the route module needs anyway is not
  // reported, whatever keeps it there: the loader reads it (the shape of
  // webdevcody/tanstack-course-platform `learn/$slug/_layout.tsx`), split
  // code reaches it only through `Route` (`Route.useLoaderData()`), or it
  // writes state the route module keeps
  it.each([
    [
      'its initialiser has effects and the loader reads it',
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { queryOptions } from './query'
        export const postOpts = queryOptions({ queryKey: ['p'] })
        function Page() { return postOpts.queryKey[0] }
        export const Route = createFileRoute('/')({
          loader: () => postOpts.queryKey,
          component: Page,
        })
      `),
    ],
    [
      'the loader reads it and split code reads `Route`',
      dedent(`
        import { createFileRoute } from 'toy-router'
        export const fetchPost = async () => ({ title: 'a' })
        function Page() { return Route.useLoaderData().title }
        export const Route = createFileRoute('/')({
          loader: () => fetchPost(),
          component: Page,
        })
      `),
    ],
    [
      'it writes a binding split code reads',
      dedent(`
        import { createFileRoute } from 'toy-router'
        let base = 'x'
        export const setBase = (b) => { base = b }
        function Page() { return base }
        export const Route = createFileRoute('/')({ component: Page })
      `),
    ],
  ])(
    'does not report an exported declaration the route module needs anyway: %s',
    async (_, code) => {
      const r = await extract(code)
      expect(r.diagnostics).toEqual([])
    },
  )

  it('does not report an export the route module needs through a declaration it re-exports', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make, wrap } from './lib'
      export const api = make()
      const plugin = wrap(api)
      export { plugin }
      function Page() { return api.x }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.diagnostics).toEqual([])
  })

  // (`options` stays only because it reads `base`: moving `base` frees it)
  it('reports an export another export stays for, not the one reading it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const kept = { n: 1 }
      export const base = { n: kept.n }
      export const options = { base }
      function Page() { return [options.base, base] }
      export const Route = createFileRoute('/')({ loader: () => kept, component: Page })
    `)
    const r = await extract(code)
    expect(
      r.diagnostics.map((d) => [d.code, d.range?.start, d.message]),
    ).toEqual([
      [
        'eager-export:reads',
        code.indexOf('base = {'),
        expect.stringContaining('it reads `kept` when it loads'),
      ],
    ])
  })

  // The move a `reads` report offers is what the export and the binding it
  // reads touch when the module loads, with the code writing them then
  // (`Events.movedWith`): left in the route module, the new module would
  // import it back, a cycle (Vite reads `undefined`, Rspack throws a TDZ
  // error). When that needs `Route`, no module of its own can take it.
  it.each([
    [
      'a binding the read one reads',
      'const cfg = { k: 2 }\nconst kept = { n: cfg.k }\nexport const count = kept.n',
      'count',
      'kept',
      'Move it, `kept` and `cfg` to their own module and import them from there.',
    ],
    [
      'a holder',
      'const o0 = { v: 1 }\nconst h6 = { c: o0 }\nexport const count = h6.c.v',
      'count',
      'h6',
      'Move it, `h6` and `o0` to their own module and import them from there.',
    ],
    [
      'a function it calls',
      'const unit = 2\nconst kept = { n: 1 }\nfunction total() { return kept.n * unit }\nexport const count = total()',
      'count',
      'kept',
      'Move it, `kept`, `unit` and `total` to their own module and import them from there.',
    ],
    [
      'a write when the module loads',
      'const kept = { n: 1 }\nkept.n = 3\nexport const count = kept.n',
      'count',
      'kept',
      'Move it, `kept` and the statements writing them when the module loads to their own module and import them from there.',
    ],
    [
      'nothing else',
      "import { loadSettings } from './settings'\nconst kept = loadSettings()\nexport const count = kept.pageSize * 2",
      'count',
      'kept',
      'Move it and `kept` to their own module and import them from there.',
    ],
    [
      '`Route` (declared after it)',
      'export const count = Route.options.path',
      'count',
      'Route',
      "It can't move to a module of its own: that module would also need `Route`, which stays in the route module.",
    ],
  ])(
    'offers, for an export reading what the route module keeps, the move of what it reads when it loads: %s',
    async (_, decls, name, read, fix) => {
      const route = dedent(`
        export const Route = createFileRoute('/')({
          loader: () => ${read === 'h6' ? 'o0' : read === 'Route' ? 'null' : read},
          component: () => ${name},
        })
      `)
      // (`Route` read after its declaration)
      const code = [
        "import { createFileRoute } from 'toy-router'",
        ...(read === 'Route' ? [route, decls] : [decls, route]),
      ].join('\n')
      const r = await extract(code)
      expect(
        r.diagnostics.map((d) => [d.code, d.range?.start, d.message]),
      ).toEqual([
        [
          'eager-export:reads',
          code.indexOf(`${name} = `),
          `[tanstack-router] The export \`${name}\` of /app/route.tsx is used only by the split \`component\`, but stays in the route module because it reads \`${read}\` when it loads, which the route module keeps, so it loads with the route module instead of with that code. ${fix}`,
        ],
      ])
    },
  )

  // code another planner claims or generates (a hydration boundary here; a
  // server function's handler and stubs in Start) is made again from its
  // source wherever that goes: only the route options' declaration keeps a
  // move from being offered (corpus: Start server functions reading a
  // middleware or a schema the route module keeps)
  it.each([
    [
      'a value holding a claimed boundary',
      'const kept = { n: cfg.n, view: () => <Hydrate><b>{cfg.n}</b></Hydrate> }\nexport const count = kept.n',
      'Move it, `kept` and `cfg` to their own module and import them from there.',
    ],
    [
      'a function it calls holding one',
      'const kept = { n: cfg.n }\nfunction View() { return <Hydrate><b>{cfg.n}</b></Hydrate> }\nexport const count = [kept.n, View()]',
      'Move it, `kept`, `cfg` and `View` to their own module and import them from there.',
    ],
  ])(
    "offers the move when what moves holds another planner's code: %s",
    async (_, decls, fix) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { Hydrate } from 'toy-start'
        const cfg = { n: 1 }
        ${decls.split('\n').join('\n        ')}
        export const Route = createFileRoute('/')({ loader: () => kept, component: () => count })
      `)
      const host = new MemoryHost({ files: { '/app/route.tsx': code } })
      const out = await host.compile(
        '/app/route.tsx',
        [
          toySplitPlanner({ keys: ['component'], extractExports: true }),
          toyHydratePlanner(),
        ],
        build,
      )
      expect(out?.diagnostics.map((d) => d.code)).toEqual([
        'eager-export:reads',
      ])
      expect(out?.diagnostics[0]!.message).toContain(
        `so it loads with the route module instead of with that code. ${fix}`,
      )
    },
  )

  // J2.8: an exported declaration a chunk needs that stays in the route
  // module is reported once per export with the reason, positioned at the
  // declaration; a route file exporting only `Route` reports nothing
  it('names the exports of one binding in the plural', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const kept = { n: 1 }
      export const value = kept.n
      export { value as alias }
      function Page() { return value }
      export const Route = createFileRoute('/')({ loader: () => kept, component: Page })
    `)
    const r = await extract(code)
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining(
        'The exports `value`, `alias` of /app/route.tsx are used only by the split `component`, but stay in the route module because ',
      ),
    ])
  })

  it('reports an exported declaration a chunk needs that stays in the route module, with the reason', async () => {
    const reads = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createStore } from './store'
      export const store = createStore()
      export const count = store.count
      function Page() { return count }
      export const Route = createFileRoute('/')({ loader: () => store, component: Page })
    `)
    let r = await extract(reads)
    expect(r.chunk).toContain("import { count } from '/app/route.tsx'")
    expect(r.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: 'eager-export:reads',
        by: 'core',
        range: { start: reads.indexOf('count = store') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain('`count`')
    expect(r.diagnostics[0]!.message).toContain('/app/route.tsx')

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
      expect(r.env).not.toContain('export---')
      expect(r.chunk).toContain("import { heavy } from './heavy'")
      expect(r.chunk).toContain('function Card() { return heavy() }')
      expect(r.chunk).not.toContain("from '/app/route.tsx")
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
      expect(r.chunk).toContain("import { clicks } from '/app/route.tsx'")
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
        "import { 'click-count' as clicks } from '/app/route.tsx'",
      )
    })

    // (as in a build, where it is the export module's, `Card` is imported)
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
      expect(r.chunk).toContain("import { Card } from '/app/route.tsx'")
      expect(r.chunk).not.toContain('function Card')
    })

    it('reports a kept export as in a build', async () => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const kept = { n: 1 }
        export const count = kept.n
        function Page() { return count }
        export const Route = createFileRoute('/')({ loader: () => kept, component: Page })
      `)
      const r = await extract(code, ['component'], dev)
      expect(r.diagnostics).toMatchObject([{ code: 'eager-export:reads' }])
    })
  })

  // An exported binding's augmentations (`Page.displayName = …`, static
  // props) are writes of it (R139): they leave with it, whatever effects
  // surround them; its module is a destination like a chunk (R149,
  // extended), so an effect that only it needs leaves too.
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    expect(r.chunk).toContain(
      "import { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain('function Page() { return Page.displayName }')
    expect(e?.code).toContain("Page.displayName = 'PageDisplay'")
    expect(e?.code).toContain("Page.preload = () => import('./heavy')")
    expect(e?.code).toContain('export { Page }')
  })

  // An extracted module is a destination like a chunk (R149, extended):
  // an unexported cluster with an effect of its own that only the extracted
  // export needs moves there, and runs when something uses the export
  it.each([
    ["function Card() { return 'card' }\n      Card.x = track('card')", 'Card'],
    ["const Card = track('card')", 'Card'],
  ])(
    'moves an unexported cluster with an effect of its own that only an extracted export reads into its module (`%s`)',
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
      expect(r.env).not.toContain("track('card')")
      expect(r.env).toContain("track('after')")
      expect(r.env).toContain(
        "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
      )
      const e = await r.extracted('Page')
      expect(e?.code).toContain("track('card')")
      expect(e?.code).not.toContain(`from '/app/route.tsx'`)
      expect(e?.code).not.toContain("track('after')")
      expect(r.diagnostics).toEqual([])
    },
  )

  it('moves an export that reads, as it loads, an unexported cluster with an effect of its own into its module, with that cluster', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './make'
      const base = make()
      export const options = { base }
      export const Route = createFileRoute('/')({ component: () => options.base })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('make()')
    expect(r.env).toContain(
      "export { options } from '/app/route.tsx?tsr-split=export---options'",
    )
    expect((await r.extracted('options'))?.code).toContain(
      'const base = make()\nconst options = { base }',
    )
    expect(r.diagnostics).toEqual([])
  })

  // The same cluster before the augmented export, which reads it only when
  // called: the augmentation writes only `Page` (R139), so the export
  // leaves, with the effectful cluster only it needs.
  it('extracts an augmented export after an unexported cluster with an effect of its own that it reads', async () => {
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
    expect(r.env).not.toContain("Card.x = track('card')")
    expect(r.env).toContain("track('after')")
    expect(r.env).toContain(
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Card.x = track('card')")
    expect(e?.code).toContain("Page.displayName = 'Page'")
    expect(r.diagnostics).toEqual([])
  })

  // The augmentation writes only `Page`: no effect to order against
  // `see()` (R139; it asserted that the export stayed, `eager-export:order`)
  it('extracts an augmented export a surviving effect precedes', async () => {
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
    expect(r.env).not.toContain('displayName')
    expect(r.env).toContain(
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    expect((await r.extracted('Page'))?.code).toContain(
      "Page.displayName = 'PageDisplay'",
    )
    expect(r.diagnostics).toEqual([])
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
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
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Page.displayName = 'PageDisplay'")
  })

  // an exported binding written by a statement and an exported reader
  // after the write: each leaves for its module, the reader's importing
  // the binding from the writer's (it evaluates after it)
  it('extracts an exported binding a statement writes and an exported reader after the write', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export const cfg = {}
      cfg.x = 1
      export const snap = [cfg]
      export const Route = createFileRoute('/')({ component: () => snap })
    `)
    const r = await extract(code)
    expect(r.env).toContain(
      "export { cfg } from '/app/route.tsx?tsr-split=export---cfg'",
    )
    expect(r.env).toContain(
      "export { snap } from '/app/route.tsx?tsr-split=export---snap'",
    )
    expect(r.diagnostics).toEqual([])
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
      "export { Card } from '/app/route.tsx?tsr-split=export---Card'",
    )
    const page = r.env.indexOf(
      "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    expect(card).toBeGreaterThan(-1)
    expect(page).toBeGreaterThan(card)
    const e = await r.extracted('Page')
    expect(e?.code).toContain("Page.displayName = 'Page'")
    expect(e?.code).toContain(
      "import { Card } from '/app/route.tsx?tsr-split=export---Card'",
    )
    expect((await r.extracted('Card'))?.code).toContain(
      "Card.displayName = 'Card'",
    )
  })

  // the executing property (toy planner, seeds 2578, 7394, 9413, 9430): a
  // route option value writing an export at load joins the route to the
  // export's cluster; an export the planner keeps (the route) is never
  // extracted, so neither is that cluster
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
    expect(r.env).not.toContain('export---')
  })

  // the corpus (edunomatseye `blog.tsx`: a server-fn chain reading an
  // exported middleware): an effectful declaration only a chunk reads may
  // read an extracted `const` at load, as it may a kept one (R29 (c)): the
  // chunk imports the extracted module, which evaluates first
  it('moves an effectful declaration reading an extracted const at load into the chunk that reads it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make, use } from './lib'
      export const logger = make()
      const fn = use(logger)
      export const Route = createFileRoute('/')({ component: () => fn })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('use(logger)')
    expect(r.chunk).toContain('const fn = use(logger)')
    expect(r.chunk).toContain(
      "import { logger } from '/app/route.tsx?tsr-split=export---logger'",
    )
    expect(r.diagnostics).toEqual([])
  })

  it('extracts an exported effectful initialiser only a chunk needs, which the chunk imports', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createTheme } from './theme'
      export const theme = createTheme()
      function Page() { return theme.page }
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain('createTheme()')
    expect(r.chunk).toContain(
      "import { theme } from '/app/route.tsx?tsr-split=export---theme'",
    )
    expect((await r.extracted('theme'))?.code).toContain(
      'const theme = createTheme()',
    )
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
    expect(r.env).not.toContain('export---')
  })

  it.each([
    "Page.displayName = 'Page'",
    "Page.preload = () => import('./heavy')",
    'Page.count += 1',
    'Page.meta.title = `x`',
    "Object.assign(Page, { title: 'x' })",
    "Page['k'] = 1",
    "Page.x = track('page')",
    "Page.x ??= track('page')",
    "Object.assign(Page, { x: track('page') })",
    "Page[track('k')] = 1",
    'Page.count++',
    'Page.icon = Icons.Home',
    "Page.icon = Icons['Home']",
    'Object.assign(Page, { Item: Icons.Item })',
    'Page.icon = Shapes.Home',
    'Page.icon = Icons.Home.small',
  ])(
    'extracts an export augmented by `%s`, with its augmentation',
    async (augmentation) => {
      const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      import * as Icons from './icons'
      import { Shapes } from './shapes'
      export function Page() { return 'page' }
      ${augmentation}
      export const Route = createFileRoute('/')({ component: Page })
    `)
      const r = await extract(code)
      expect(r.env).toContain('export---Page')
      expect(r.env).not.toContain(augmentation)
      expect((await r.extracted('Page'))?.code).toContain(augmentation)
    },
  )

  it('extracts an augmented export whose augmentation has an effect of its own, with it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './track'
      export function Page() { return 'page' }
      Page.x = track('page')
      track('after')
      export const Route = createFileRoute('/')({ component: Page })
    `)
    const r = await extract(code)
    expect(r.env).not.toContain("Page.x = track('page')")
    expect(r.env).toContain("track('after')")
    expect(r.chunk).toContain(
      "import { Page } from '/app/route.tsx?tsr-split=export---Page'",
    )
    expect((await r.extracted('Page'))?.code).toContain(
      "Page.x = track('page')",
    )
    expect(r.diagnostics).toEqual([])
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
    expect(main?.code).not.toContain('const Page')
    expect(main?.code).toContain('const util')
    expect(main?.code).not.toContain('tsr-split=component')
    expect(chunk?.code).toContain('const Page = (() =>')
    expect(chunk?.code).toContain("import { util } from '/app/route.tsx'")
  })

  // R148: the compiler deletes no dead code; it follows what it reads
  it('moves an unreferenced function with the component it renders', async () => {
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
    expect(r.chunks.component).toContain(
      'function Page() { return heavy() }\nfunction Unused() { return Page() }',
    )
  })

  // R148: an unused function reading only imports goes where their users
  // go (imports go wherever their users go)
  it.each([
    [
      'moves an unused function reading only imports with the chunk using them',
      ['component'],
      'moves',
    ],
    [
      'keeps an unused function reading imports two chunks use',
      ['component', 'errorComponent'],
      'stays',
    ],
  ] as const)('%s', async (_, keys, outcome) => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { Button } from './ui'
      function Page() { return Button() }
      function Other() { return Button() }
      function Unused() { return Button() + 1 }
      export const Route = createFileRoute('/')({ component: Page, errorComponent: Other })
    `)
    const r = await split(code, { keys: [...keys] })
    if (outcome === 'moves') {
      expect(r.env).not.toContain('function Unused')
      expect(r.chunks.component).toContain(
        'function Unused() { return Button() + 1 }',
      )
    } else {
      expect(r.env).toContain('function Unused() { return Button() + 1 }')
    }
  })

  // (careflow-clinic-compass: an unused step component reading an
  // extracted export and the page's helpers) an extracted export is read by
  // importing its module, wherever the reader goes: it decides nothing
  // R149: a follower using a binding that stays (an export) stays; whether
  // unused code should keep what it names is open (E)
  it("puts an unused function reading an exported binding into the export's module", async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          export function Shell() { return 'shell' }
          function Avatar() { return 'avatar' }
          function Page() { return Shell() + Avatar() }
          function Unused() { return Shell() + Avatar() }
          export const Route = createFileRoute('/')({ component: Page })
        `),
      },
    })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const r = await host.compile('/app/route.tsx', planners, env)
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      env,
    )
    // (R148, recheck ruling A: into the export's module, with it)
    expect(r?.code).not.toContain('function Unused()')
    expect(chunk?.code).not.toContain('function Unused()')
    const module = await host.compile(
      '/app/route.tsx?tsr-split=export---Shell',
      planners,
      env,
    )
    expect(module?.code).toContain('function Unused()')
  })

  // an unused declaration with an effect of its own reading only imports
  // stays where it was written: imports' users place only what runs
  // nothing (the dead-code page: a namespace calling `track`)
  it('keeps an unused declaration with an effect of its own reading only imports', async () => {
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
  // the pushes write `plugins` with pure values (R139): no effect, so the
  // initialiser reading it between them moves with them, in source order
  // (it asserted that both stayed in the route module)
  it('moves an eager reader between two pure augmentations with them', async () => {
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
    expect(r.env).not.toContain('plugins')
    expect(r.chunks.component).toContain(
      'const plugins = []\nplugins.push(a)\nconst store = init({ plugins: [...plugins] })\nplugins.push(b)',
    )
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

  it.each([
    [
      'a constructor parameter',
      'constructor(@inject() readonly dep: unknown) {}',
    ],
    ['a method parameter', 'use(@inject() dep: unknown) { return dep }'],
    ['a method', '@inject() use() {}'],
  ])(
    'moves an exported class with a decorator on %s into its module, with the decorator (it runs when that module loads)',
    async (_, member) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { inject } from './di'
        export class Service { ${member} }
        export const Route = createFileRoute('/')({
          component: () => new Service(1),
        })
      `)
      const r = await split(code, { extractExports: true, mode: 'build' })
      expect(r.main?.diagnostics).toEqual([])
      expect(r.env).not.toContain('@inject()')
      expect(r.env).toContain(
        "export { Service } from '/app/route.tsx?tsr-split=export---Service'",
      )
    },
  )

  it('extracts an exported class without decorators', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      export class Service { constructor(readonly dep: unknown) {} }
      export const Route = createFileRoute('/')({
        component: () => new Service(1),
      })
    `)
    const r = await split(code, { extractExports: true })
    expect(r.main?.diagnostics).toEqual([])
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
    expect(r.chunks.component).toContain("import { q } from '/app/route.tsx'")
    expect(r.chunks.component).toContain("const page = [make('page'), q.tv]")
  })

  it.each([
    ['reassigned', 'let', 'q = { tv: 1 }'],
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
      expect(r.chunks.component).toContain(
        "import { page } from '/app/route.tsx'",
      )
    },
  )

  // A write of pure values to a binding is a write, not an effect (R139):
  // it is ordered against what reads the binding, not against other effects
  it('moves a component with a pure augmentation an unknown call follows', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { log } from './log'
      function Inner() { return Inner.displayName }
      Inner.displayName = 'X'
      log()
      export const Route = createFileRoute('/')({
        component: () => Inner(),
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('log()')
    expect(r.env).not.toContain('displayName')
    expect(r.chunks.component).toContain(
      "function Inner() { return Inner.displayName }\nInner.displayName = 'X'",
    )
    expect(r.main?.diagnostics).toEqual([])
  })

  // a write through a binding that names another one's object writes that
  // object: an effect, ordered against the read of the other binding. The
  // write joins the cluster of the object it writes (final review finding
  // 1), so when only the chunk needs them they move together, in order.
  it.each([
    ['an alias', 'const alias = cfg\nconst y = [cfg.a]\nalias.a = 2'],
    [
      'a member of a holder',
      'const holder = { c: cfg }\nconst y = [cfg.a]\nholder.c.a = 2',
    ],
    [
      'a reassigned binding',
      'let other = {}\nother = cfg\nconst y = [cfg.a]\nother.a = 2',
    ],
  ])('keeps a read before a write through %s in order', async (_, decls) => {
    const code = dedent(`
        import { createFileRoute } from 'toy-router'
        const cfg = { a: 1 }
        ${decls.split('\n').join('\n        ')}
        export const Route = createFileRoute('/')({
          component: () => y,
        })
      `)
    const r = await split(code)
    expect(r.env).not.toContain('cfg')
    expect(r.chunks.component).toContain(`const cfg = { a: 1 }\n${decls}`)
  })

  // its first effect is the call after the unknown one: the pure write
  // before it moves with it
  it('moves a cluster whose first effect follows the unknown call, its pure write with it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { second } from './make'
      import { log } from './log'
      function Page() { return Page.a + Page.b }
      Page.a = 'a'
      log()
      Page.b = second()
      export const Route = createFileRoute('/')({
        component: Page,
      })
    `)
    const r = await split(code)
    expect(r.env).toContain('log()')
    expect(r.env).not.toContain('second()')
    expect(r.chunks.component).toContain("Page.a = 'a'\nPage.b = second()")
  })

  // N for a cluster that writes only what it declares: several chunks
  // need it, so it goes to a shared module, which every reader imports
  // (it evaluates before them, its writes included)
  it('moves a component with a pure augmentation two chunks need to a shared module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      function Page() { return 'page' }
      Page.displayName = 'P'
      const r = [Page]
      export const Route = createFileRoute('/')({
        loader: () => Page,
        component: () => r,
      })
    `)
    const out = await split(code, { keys: ['loader', 'component'] })
    expect(out.env).not.toContain('displayName')
    expect(out.chunks.component).toContain('const r = [Page]')
    expect(out.chunks.component).toMatch(
      /import \{ Page \} from '\/app\/route\.tsx\?tsr-split=shared---/,
    )
    expect(out.main?.diagnostics).toEqual([])
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

  // R146 amendment: handing it to an import changes nothing; the call
  // follows what it reads
  it('moves an augmented component with a call handing it to an import', async () => {
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
    expect(r.env).not.toContain('displayName')
    expect(r.env).not.toContain('register(Page)')
    expect(r.chunks.component).toContain(
      "function Page() { return Page.displayName }\nPage.displayName = 'PageDisplay'\nregister(Page)",
    )
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
      /import \{ Home\b[^}]*\} from '\/app\/route\.tsx'/,
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
      /import \{ Home\b[^}]*\} from '\/app\/route\.tsx'/,
    )
  })

  // (two split options' values declared by one effect: their shared module
  // holds it, R151, and both options split; `env-declared` is left for a
  // value the env module keeps, below)
  it('splits two options whose values one effect declares, from their shared module', async () => {
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
    expect(r.main?.facts.planners['toy-split']).toBeUndefined()
    expect(r.env).not.toContain('make()')
    expect(r.chunks.component).toContain(
      "from '/app/route.tsx?tsr-split=shared---component---errorComponent'",
    )
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
    expect(r.chunks.component).toContain(
      "import { page } from '/app/route.tsx'",
    )
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
      "import { exported } from '/app/route.tsx'",
    )
    expect(r.chunks.component).toContain(
      "import { shape } from '/app/route.tsx?tsr-split=shared---component---errorComponent'",
    )
    expect(r.chunks.errorComponent).toContain("import { fmt } from './fmt'")
    expect(r.chunks.errorComponent).toContain(
      "import { shape } from '/app/route.tsx?tsr-split=shared---component---errorComponent'",
    )
    const shared = await r.host.compile(
      '/app/route.tsx?tsr-split=shared---component---errorComponent',
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
    expect(r.chunks.loader).toContain("import { Route } from '/app/route.tsx'")
    expect(r.chunks.loader).not.toContain('Page')
    const plans = r.host.caches.plans.get('client')!
    const outputs = plans
      .keysAt('/app/route.tsx')
      .flatMap((k) => Object.keys(plans.get(k)!.plan.outputs))
    expect(outputs.length).toBeGreaterThan(0)
    expect(outputs.some((o) => o.includes('shared---'))).toBe(false)
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
      import { exported } from '/app/route.tsx'
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
    expect(host.edgesOf(out!).map((e) => [e.specifier, e.kind])).toContainEqual(
      ['./thing', 'evaluation'],
    )
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
    expect(host.edgesOf(out!).map((e) => e.specifier)).not.toContain('./labels')
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
        ctx.rewrites.placeholder({
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
        /import \{[^}]*\b(initial|Snap)\b[^}]*\} from '\/app\/route\.tsx'/,
      )
    },
  )

  // what runs at load runs where it is evaluated (DESIGN §3.4.3): an
  // assignment in a function the load calls, a read in a function declared
  // after a later write, writes in code that evaluates with the module but
  // runs later (an async or generator IIFE, an instance field)
  it.each([
    [
      'a function it calls assigns a binding the route module reads',
      "let mode = 'idle'\nfunction init() { mode = 'ready'; return 1 }\nconst snap = init()",
      'mode',
    ],
    [
      'a function declared after a later write reads a member',
      'const obj = { v: 0 }\nconst snap = /* @__PURE__ */ read()\nobj.v = 5\nfunction read() { return obj.v }',
      'obj.v',
    ],
    [
      'an async IIFE writes a member after an await',
      'const state = { v: 0 }\n;(async () => { await null; state.v = 5 })()\nfunction read() { return state.v }\nconst snap = read()',
      'state.v',
    ],
    [
      'a generator IIFE writes a member',
      'const state = { v: 0 }\nconst steps = (function* () { state.v = 5 })()\nfunction read() { return state.v }\nconst snap = read()',
      '(steps.next(), state.v)',
    ],
    [
      'an instance field writes a member',
      'const counter = { n: 0 }\nclass Item { id = counter.n++ }\nfunction read() { return counter.n }\nconst snap = read()',
      'new Item().id',
    ],
  ])(
    'keeps a value computed at load in the route module when %s',
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
      expect(r.env).toMatch(/const snap = /)
      expect(r.chunks.component).not.toMatch(/const snap = /)
      expect(r.chunks.component).toContain(
        "import { snap } from '/app/route.tsx'",
      )
    },
  )

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
    ['a default', "const { beta = track('beta') } = {}"],
    ['a computed key', "const { [track('beta')]: beta } = { beta: 1 }"],
  ])(
    'moves an exported destructuring whose pattern has %s with a call into its module, with the call',
    async (_, declaration) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { track } from './analytics'
        export ${declaration}
        export const Route = createFileRoute('/')({
          component: () => beta,
        })
      `)
      const r = await split(code, { extractExports: true, mode: 'build' })
      expect(r.main?.diagnostics).toEqual([])
      expect(r.env).not.toContain('track(')
      expect(r.env).toContain(
        "export { beta } from '/app/route.tsx?tsr-split=export---beta'",
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
      "import { snapshot } from '/app/route.tsx'",
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
      'called through a type assertion',
      'const initial = ((() => n) as () => number)()',
      true,
    ],
    ['called through !', 'const initial = ((() => n)!)()', true],
    ['called optionally', 'const initial = (() => n)?.()', true],
    [
      'called through a type assertion and .call',
      'const initial = ((function () { return n }) as () => number).call(null)',
      true,
    ],
    [
      'bound and called',
      'const initial = (function () { return n }).bind(null)()',
      true,
    ],
    [
      'constructed',
      'const initial = new (function (this: any) { this.v = n } as any)().v',
      true,
    ],
    ['bound, not called', 'const initial = (() => n).bind(null)', false],
    // without semicolons, a line starting with `(` after an arrow's block
    // is a statement of its own: the arrow is not called
    [
      'followed by a statement in parentheses',
      'const read = () => {\n  return n\n}\n(globalThis as any).seen = 1\nconst initial = read',
      false,
    ],
    // a function passed to a call may run when the call does (the module
    // does not know what `wrap` does with it): its read counts as eager
    [
      'an argument of a call whose result is called',
      'const initial = wrap(() => n)()',
      true,
    ],
    ['an argument of a call', 'const initial = wrap(() => n)', true],
    ['an argument of a method', "const initial = ['x'].map(() => n)", true],
    [
      'an argument of an awaited call',
      'const initial = await wrap(() => n)',
      true,
    ],
    [
      'called by a function the declaration calls',
      'function read() { return n }\nconst initial = [read()]',
      true,
    ],
    [
      'passed apart to a call',
      'const read = () => n\nconst initial = wrap(read)',
      true,
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
    [
      'called at load and updating the state',
      'function bump() { return ++n }\nconst initial = [bump()]',
      true,
    ],
    [
      'called by a callback and adding to the state',
      'function bump() { return (n += 1) }\nconst initial = [1].map(() => bump())',
      true,
    ],
    [
      'after a member read',
      "const initial = cond.toString() ? ['x'].map(() => n) : []",
      true,
    ],
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
      const initial = declaration.slice(declaration.lastIndexOf('\n') + 1)
      expect(r.env.includes(initial)).toBe(eager)
      expect((r.chunks.component ?? '').includes(initial)).toBe(!eager)
    },
  )

  // what the statement's evaluation runs keeps it in the route module, and
  // with it, a later write (`seen = n` in the callback) keeps its readers
  // (design 2 step 3: a reader of `seen` after its last write at load, the
  // assignment's, moves; the row asserted that it travelled with `seen`)
  it.each([
    [
      'an if statement',
      "if (cond) { ['x'].forEach(() => { seen = n }) }",
      'const initial = [seen]',
    ],
    [
      'an assignment of a call',
      'seen = wrap(() => n)()',
      'seen = wrap(() => n)()',
    ],
  ])(
    'counts a callback passed in %s at the top level as run at load',
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
    [
      'reads the state',
      'function wrap(C) { const v = n; return () => v + C() }',
      false,
    ],
    ['reads nothing written', 'function wrap(C) { return () => C() }', true],
  ])(
    'an option value calling a helper that %s splits accordingly',
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

  it('a component that reads state moves when the route options are built by an effectful call', async () => {
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
    expect(r.chunks.component).toContain("import { cfg } from '/app/route.tsx'")
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
      "import { snapshot } from '/app/route.tsx'",
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

// What a declaration's evaluation reads, writes and calls has one
// definition, asked of each declaration (design 2, P1): its own text that
// runs (unclaimed regions inside it included), the callbacks it passes to a
// call, and, when it calls anything, the bodies of the module's functions
// those name. Source: review of 2026-11-10, F1 (F1-1, F1-2, F1-3a, F1-5a,
// Q2).
describe('what an evaluation runs: one walk for every rule', () => {
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
      kept: (main?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      ),
    }
  }

  // F1-1: a binding a top-level `if` or `try` also assigns joins that
  // statement, so the walk stopped at its cluster and never saw the write
  it.each([
    [
      'a top-level if assigns it too',
      'let seq = 0\nif (import.meta.env.DEV) { seq = 1000 }\nconst nextId = () => ++seq\nconst firstId = nextId()',
      'firstId',
      'seq',
      'loader: () => nextId(),',
    ],
    [
      'nothing else assigns it (control)',
      'let seq = 0\nconst nextId = () => ++seq\nconst firstId = nextId()',
      'firstId',
      'seq',
      'loader: () => nextId(),',
    ],
    [
      'a top-level try assigns it too',
      "import { open, wrap } from './lib'\nlet conn\ntry { conn = open() } catch { conn = null }\nconst reconnect = () => (conn = open())\nconst first = wrap(reconnect())",
      'first',
      'conn',
      'loader: () => reconnect(),',
    ],
    [
      'its initialiser assigns it (control)',
      "import { open, wrap } from './lib'\nlet conn = open()\nconst reconnect = () => (conn = open())\nconst first = wrap(reconnect())",
      'first',
      'conn',
      'loader: () => reconnect(),',
    ],
  ])(
    'keeps a declaration whose load calls a function assigning module state in the route module when %s',
    async (_, declarations, name, state, loader) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        ${declarations.replaceAll('\n', '\n        ')}
        export const Route = createFileRoute('/')({
          ${loader}
          component: () => ${name},
        })
      `)
      const r = await compile(code)
      expect(r.env).toMatch(new RegExp(`const ${name} = `))
      expect(r.chunk).not.toMatch(new RegExp(`const ${name} = `))
      expect(r.chunk).toContain(`import { ${name} } from '/app/route.tsx'`)
      expect(r.kept).toMatchObject([
        {
          severity: 'warning',
          code: 'eager-split:state',
          range: { start: code.indexOf(`${name} = `) },
        },
      ])
      expect(r.kept[0]!.message).toContain(`\`${state}\``)
    },
  )

  // F1-5a: holding a function runs nothing, whoever else calls it at load
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
    expect(r.kept).toEqual([])
  })

  // A name's value is its declaration and the top-level statements writing
  // it: a function a later statement attaches (or assigns) runs when a call
  // at load reaches the name. Source: review of design 2 steps 0-1
  // (2026-11-11), finding 1 (wrong output at the base: `x` moved and read
  // `n` after `inc()` ran).
  it.each([
    [
      'attached to an object, called through a function',
      "const handlers = {}\nhandlers.count = () => n\nfunction run(k) { return handlers[k]() }\nconst x = run('count')",
      'handlers',
      'state',
      'n',
    ],
    [
      'attached to an object, the call pure',
      'const api = {}\napi.get = () => n\nconst call = () => api.get()\nconst x = /* @__PURE__ */ call()',
      'api',
      'state',
      'n',
    ],
    [
      'assigned to a `let`, the call pure',
      'let g\ng = () => n\nconst call = () => g()\nconst x = /* @__PURE__ */ call()',
      'g',
      // (design 2 step 3: R29's rule (c) is a rule of effectful clusters;
      // the pure `x` was reported for reading the `let` `g` first)
      'state',
      'n',
    ],
  ])(
    'keeps a declaration whose load calls a function %s in the route module',
    async (_, declarations, object, reason, read) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        let n = 0
        export function inc() { n++ }
        ${declarations.replaceAll('\n', '\n        ')}
        export const Route = createFileRoute('/')({
          loader: () => { inc(); return ${object} },
          component: () => x,
        })
      `)
      const r = await compile(code)
      expect(r.env).toMatch(/const x = /)
      expect(r.chunk).not.toMatch(/const x = /)
      expect(r.chunk).toContain("import { x } from '/app/route.tsx'")
      expect(r.kept).toMatchObject([
        {
          code: `eager-split:${reason}`,
          range: { start: code.indexOf('x = ') },
        },
      ])
      expect(r.kept[0]!.message).toContain(`\`${read}\``)
    },
  )

  // the direct spelling: `x` reads `handlers` after its last write, and the
  // function that write attaches reads `n`, which `inc` writes (V)
  it('keeps a declaration whose load calls a method a later statement attaches in the route module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 0
      export function inc() { n++ }
      const handlers = {}
      handlers.count = () => n
      const x = handlers.count()
      export const Route = createFileRoute('/')({
        loader: () => { inc(); return handlers },
        component: () => x,
      })
    `)
    const r = await compile(code)
    expect(r.env).toContain('const x = handlers.count()')
    expect(r.chunk).not.toContain('const x = ')
    expect(r.chunk).toContain("import { x } from '/app/route.tsx'")
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0]!.code).toMatch(/^eager-split:/)
  })

  // F1-3a: a method nested in an object argument runs only when called,
  // in an option value as in a declaration
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
    'splits an option value passing a method reading lazily written state to a call, %s',
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
      expect(r.kept).toEqual([])
    },
  )

  it('keeps an option value passing state something writes later to a call in place (ordered-effect, control)', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { wrap } from './lib'
      let n = 0
      export function inc() { n++ }
      export const Route = createFileRoute('/')({
        component: wrap(n),
      })
    `)
    const r = await compile(code)
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      notSplittable: 'component',
      reasons: { component: 'ordered-effect' },
    })
    expect(r.env).toContain('component: wrap(n)')
  })

  // Q2: an unclaimed region inside a declaration (a planner's region left
  // unclaimed, a Start `custom` region) is the declaration's text
  it('reads an unclaimed region inside a declaration as the declaration text', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { f } from './lib'
      let n = 0
      export function inc() { n++ }
      const x = f(n + 1)
      export const Route = createFileRoute('/')({
        component: () => x,
      })
    `)
    const region: Planner = {
      name: 'toy-region',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const start = ctx.analysis.source.code.indexOf('n + 1')
        ctx.region({ start, end: start + 'n + 1'.length }, 'custom')
      },
    }
    const r = await compile(code, [toySplitPlanner(), region])
    expect(r.env).toContain('const x = f(n + 1)')
    expect(r.chunk).not.toContain('f(n + 1)')
    expect(r.kept).toMatchObject([
      { code: 'eager-split:state', range: { start: code.indexOf('x = ') } },
    ])
  })

  // a function passed to a call evaluates nothing itself: what reads state
  // in it runs when the call around it calls it (a server fn's handler)
  it.each([
    ['a function passed to a call', '() => String(n)', null],
    ['a call (control)', '(() => String(n))()', 'ordered-effect'],
  ])(
    'reports a region that is %s as observing lazily written state accordingly',
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
            fallback: ctx.fallbackAt(range)?.reason ?? null,
          })
        },
      }
      const r = await compile(code, [toySplitPlanner(), region])
      expect(r.main?.facts.planners['toy-region']).toEqual({
        fallback: reason,
      })
    },
  )

  // F1-2: an extracted export's module evaluates when something first
  // imports it (with the chunk, once nothing imports the binding through
  // the route file): a snapshot of state the route module's functions write
  // would then see a later value, so it stays (V on candidates).
  const snapshot = dedent(`
    import { createFileRoute } from 'toy-router'
    let n = 0
    export function inc() { n++ }
    export const initial = [n]
    export const Route = createFileRoute('/')({
      component: () => { inc(); return initial },
    })
  `)
  it('keeps an exported snapshot of state an exported function writes in the route module in a build', async () => {
    const r = await compile(snapshot, [
      toySplitPlanner({ extractExports: true }),
    ])
    expect(r.env).toContain('export const initial = [n]')
    expect(r.env).not.toContain('export---initial')
    expect(r.kept).toMatchObject([
      {
        code: 'eager-export:state',
        range: { start: snapshot.indexOf('initial = ') },
      },
    ])
    expect(r.kept[0]!.message).toBe(
      '[tanstack-router] The export `initial` of /app/route.tsx is used only by the split `component`, but stays in the route module because it uses `n` when it loads, and the route module writes `n`, so it loads with the route module instead of with that code. Use `n` inside the code that needs it, or move it, `n` and `inc` to their own module and import them from there.',
    )
  })

  it('places an exported snapshot of written state as dev does, in a build', async () => {
    const planners = [toySplitPlanner({ extractExports: true })]
    const build = await compile(snapshot, planners, envInfo({ mode: 'build' }))
    const dev = await compile(snapshot, planners, envInfo({ mode: 'dev' }))
    expect(build.env).toBe(dev.env)
    expect(build.chunk).toBe(dev.chunk)
    expect(build.kept).toEqual(dev.kept)
  })
})

// A declaration only split code needs that the movable test keeps in the
// route module (evaluation order, writes, eager reads) is reported once, at its
// cause, positioned at the declaration and naming why; nothing is reported
// when it moves, or when the split code needs nothing pinned.
// design 2 step 3: a reader of written state is a cluster of its own, placed
// by the order rule against the writes on both sides' slots; a binding's
// writers at load stay in its cluster
describe('readers and writers of state written at load', () => {
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
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

  // the listed difference of step 3: it no longer travels with the binding
  // the route module keeps, nor is it reported
  it('moves a declaration that reads a binding after its last write at load, which the route module keeps', async () => {
    const r = await split(
      route(
        'const a = {}\na.v = 1\nconst x = [a]',
        'loader: () => a,\ncomponent: () => x,',
      ),
      { files: lib },
    )
    expect(r.env).toContain('a.v = 1')
    expect(r.env).not.toContain('const x = [a]')
    expect(r.chunks.component).toContain('const x = [a]')
    expect(r.chunks.component).toContain("import { a } from '/app/route.tsx'")
    expect(eager(r)).toEqual([])
  })

  it('moves a reader, its binding and the write after it together when one chunk needs them', async () => {
    const r = await split(
      route(
        'const a = {}\nconst x = [a]\na.v = 1',
        'loader: () => 1,\ncomponent: () => [x, a],',
      ),
      { files: lib },
    )
    expect(r.env).not.toContain('const x')
    expect(r.chunks.component).toContain('const a = {}\nconst x = [a]\na.v = 1')
    expect(eager(r)).toEqual([])
  })

  it('keeps a declaration that reads a binding before a later write the route module keeps', async () => {
    const r = await split(
      route(
        'let n = 0\nconst x = [n]\nn = 5',
        'loader: () => n,\ncomponent: () => x,',
      ),
      { files: lib },
    )
    expect(r.env).toContain('const x = [n]')
    expect(eager(r)).toMatchObject([{ code: 'eager-split:state' }])
    expect(eager(r)[0]!.message).toContain('`n`')
  })

  // a member write in an initialiser is a writer of the binding: it stays
  // in the binding's cluster, so the route module's reader sees it (it was
  // reported `eager-split:state` as a reader the union merged, which an
  // assignment writer, `const y = (n = 1, 5)`, never was: unreported now)
  it.each([
    [
      'an effectful call',
      'const y = track(cfg.x = 1)',
      'const r = [/* @__PURE__ */ get()]',
    ],
    [
      'a pure call',
      'const y = /* @__PURE__ */ f(cfg.x = 1)',
      'const r = [/* @__PURE__ */ get()]',
    ],
    [
      'a pure call, read directly',
      'const y = /* @__PURE__ */ f(cfg.x = 1)',
      'const r = [cfg]',
    ],
  ])(
    'keeps a declaration whose initialiser writes a member of a binding the route module reads, in %s',
    async (_, writer, reader) => {
      const r = await split(
        route(
          `const cfg = {}\n${writer}\nconst get = () => cfg.x\n${reader}`,
          'loader: () => r,\ncomponent: () => y,',
        ),
        { files: lib },
      )
      expect(r.env).toContain(writer)
      expect(r.chunks.component).toContain("import { y } from '/app/route.tsx'")
      expect(eager(r)).toEqual([])
    },
  )

  it('keeps an exported reader of an import a declaration writes when the module loads', async () => {
    const r = await split(
      route(
        'const y = /* @__PURE__ */ f(open.x = 1)\nconst get = () => open.x\nexport const snap = [/* @__PURE__ */ get()]',
        'loader: () => y,\ncomponent: () => snap,',
      ),
      { files: lib, extractExports: true },
    )
    expect(r.env).toContain('export const snap = [/* @__PURE__ */ get()]')
    expect(r.env).toContain('const y = /* @__PURE__ */ f(open.x = 1)')
    // (the declaration writing the import is no longer joined to it: the
    // export reads state the module writes at load)
    expect(eager(r)).toMatchObject([{ code: 'eager-export:state' }])
  })

  // A claimed option value's evaluation writes `seen` when the module loads
  // (a member write: the single-writer rule takes assignments only), and a
  // later evaluation reads it: a conflicting pair under O,
  // so the value stays in place (`ordered-effect`, naming the binding).
  // Wrong output before design 2 step 3 (and at dd7a83110f): the write moved
  // to the chunk and the reader saw the array empty, with no diagnostic.
  it.each([
    [
      'the route module',
      "loader: () => snap,\ncomponent: f(seen.push('x') && (() => null)),",
    ],
    [
      'another chunk',
      "component: f(seen.push('x') && (() => null)),\nerrorComponent: () => snap,",
    ],
    // (the option value's text evaluates after the chunk's own code)
    ['its own chunk', "component: f(seen.push('x') && (() => snap)),"],
  ])(
    'keeps an option value that writes a member at load in place when %s reads it later',
    async (_, options) => {
      const r = await split(
        route('const seen = []', options, 'const snap = seen.length'),
        { files: lib, keys: ['component', 'errorComponent'] },
      )
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: 'ordered-effect' },
      })
      expect(r.env).toContain("component: f(seen.push('x')")
    },
  )

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
  // Architect rulings on the design 2 step 3 review. An assignment in the
  // value is a write of its event as a member write is (finding 2): `n`
  // read later at load saw it unassigned.
  it.each([
    [
      'the route module',
      'loader: () => snap,\ncomponent: f((n = 1, () => null)),',
    ],
    ['its own chunk', 'component: f((n = 1, () => snap)),'],
    ['its own chunk, through `++`', 'component: f((n++, () => snap)),'],
  ])(
    'keeps an option value that assigns a binding at load in place when %s reads it later',
    async (_, options) => {
      const r = await split(route('let n = 0', options, 'const snap = [n]'), {
        files: lib,
        keys: ['component', 'errorComponent'],
      })
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
      })
      expect(r.env).toContain('component: f((n')
    },
  )

  // A member write of an import (finding 3): the specifier has an instance
  // per output, the object one. The value stays unless no other output
  // names the import and nothing in its own output reads it at load.
  it.each([
    [
      'the route module reads it',
      'loader: () => snap,\ncomponent: f((open.page = 1, () => null)),',
      'const snap = [open]',
    ],
    [
      'another output names it',
      'loader: () => open.page,\ncomponent: f((open.page = 1, () => null)),',
      '',
    ],
    [
      'its own chunk reads it at load',
      'component: f((open.page = 1, () => snap)),',
      'const snap = [open.page]',
    ],
  ])(
    'keeps an option value that writes a member of an import in place when %s',
    async (_, options, extra) => {
      const r = await split(route('', options, extra), { files: lib })
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: 'ordered-effect' },
      })
      expect(r.env).toContain('component: f((open.page = 1')
    },
  )

  // REVIEW-design2-final finding 2: the single-writer rule homes the
  // binding the value writes with it, whoever reads it; a reader in a
  // module two chunks share would import it from the value's chunk, which
  // imports that module. A reader anywhere else keeps the value in place.
  it.each([
    [
      'a module two chunks share',
      'loader: () => flags,\ncomponent: (n = 5, () => flags),',
      ['loader', 'component'],
    ],
    [
      'another chunk',
      'component: (n = 5, () => null),\nerrorComponent: () => flags,',
      ['component', 'errorComponent'],
    ],
  ])(
    'keeps an option value in place whose `let` %s reads',
    async (_, options, keys) => {
      const r = await split(route('let n = 1', options, 'const flags = [n]'), {
        keys,
      })
      expect(r.main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: 'ordered-effect' },
      })
      expect(r.env).toContain('let n = 1')
      expect(r.env).toContain('component: (n = 5, () => ')
    },
  )

  it('splits an option value that writes a member of an import only its chunk names', async () => {
    const r = await split(
      route('', 'component: f((open.page = 1, () => open.page)),'),
      { files: lib },
    )
    expect(r.env).not.toContain('open.page')
    expect(r.chunks.component).toContain('open.page = 1')
  })

  // R152: a call whose result is an option value (the router calls it
  // later) holds the function it is handed, inline or named: its write runs
  // when the router calls the value, not when the module loads, so the
  // value splits and the binding stays with the route module's reader
  // (finding 4 read every call as running its function).
  it.each([
    [
      'inline',
      'component: f(function Page() { seen.n = 1; return null }),',
      '',
    ],
    [
      'named',
      'component: f(Page),',
      'function Page() { seen.n = 1; return null }',
    ],
  ])(
    'splits an option value whose call holds a function writing a binding the route module reads (%s)',
    async (_, options, decls) => {
      const r = await split(
        route(
          `const seen = {}\n${decls}`,
          `loader: () => snap,\n${options}`,
          'const snap = [seen]',
        ),
        { files: lib },
      )
      const facts = r.main?.facts.planners['toy-split'] as
        | { notSplittable?: string }
        | undefined
      expect(facts?.notSplittable).toBeUndefined()
      expect(r.chunks.component).toContain('seen.n = 1')
      expect(r.env).toContain('const seen = {}')
      expect(r.main?.diagnostics).toEqual([])
    },
  )

  // REVIEW-design2-step4 finding 3: that write pins the value only when
  // the binding is not confined to its chunk, as a write at load by the
  // value (rulings 2 and 3): nothing else touching it, it splits, with the
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

  // REVIEW-design2-final finding 5 (architect: one rule): the same holds
  // for a declaration. A binding only its own callback writes, which
  // nothing else touches when the module loads, does not pin it: the
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

  // small item 2b under R152: a write at an unknown time that only the
  // value's chunk runs pins the value only when another evaluation touches
  // the binding at load, not because the binding stays in the route module
  // for a later reader: a function the value reaches other than as a name
  // handed to its call splits as its inline spelling does
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
    'splits an option value reaching a function that writes a binding the route module reads later (%s)',
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

  it('splits an option value whose call holds a function writing a binding another function writes later (R152)', async () => {
    const r = await split(
      route(
        'const seen = { n: 0 }\nexport function reset() { seen.n = 0 }',
        'component: f(function Page() { seen.n++; return null }),',
      ),
      { files: lib },
    )
    const facts = r.main?.facts.planners['toy-split'] as
      | { notSplittable?: string }
      | undefined
    expect(facts?.notSplittable).toBeUndefined()
    expect(r.chunks.component).toContain('seen.n++')
    expect(r.env).toContain('export function reset()')
    expect(r.main?.diagnostics).toEqual([])
  })

  // A member write inside a planner's unclaimed region is its declaration's
  // write (finding 1): the declaration stays with the binding it writes.
  it('keeps a declaration writing a member inside an unclaimed region with the binding', async () => {
    const code = route(
      'const cfg = {}\nconst y = track(cfg.x = 1)\nconst get = () => cfg.x\nconst r = [/* @__PURE__ */ get()]',
      'loader: () => r,\ncomponent: () => y,',
    )
    const region: Planner = {
      name: 'toy-region',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const start = ctx.analysis.source.code.indexOf('cfg.x = 1')
        ctx.region({ start, end: start + 'cfg.x = 1'.length }, 'custom')
      },
    }
    const host = new MemoryHost({ files: { '/app/route.tsx': code, ...lib } })
    const out = await host.compile(
      '/app/route.tsx',
      [toySplitPlanner(), region],
      { env: envInfo({ mode: 'build' }) },
    )
    expect(out?.code).toContain('const y = track(cfg.x = 1)')
    expect(out?.diagnostics.map((d) => d.code)).not.toContain(
      'internal-invariant',
    )
  })

  // The same in a declaration: a write in a function passed to a call is a
  // write when the declaration evaluates, so it stays with its binding.
  it('keeps a declaration whose call runs a function writing a binding the route module reads with it', async () => {
    const r = await split(
      route(
        'const cfg = {}\nconst y = track(() => { cfg.x = 1 })\nconst get = () => cfg.x\nconst r = [/* @__PURE__ */ get()]',
        'loader: () => r,\ncomponent: () => y,',
      ),
      { files: lib },
    )
    expect(r.env).toContain('const y = track(() => { cfg.x = 1 })')
  })
})

// R138 (design 2 step 5): the order rule is judged on the slots of both
// sides. An effectful declaration reading another one at load moves when
// the one it reads evaluates in the same chunk (source order there), or
// stays in the route module as a `const`; each is still ordered against
// the effects that stay.
// REVIEW-design2-step4 findings 1 and 2: state reached through another
// name. A read through an alias, a holder or a spread reads the object
// the other name names (what its declaration and its writes at load name,
// as a call would follow), so it is ordered against a write of the
// original. A method named like a mutator (`push`, `set`, `add`) of an
// object the module defines is its own code: a call, an effect (R65).
describe('state reached through another name', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { track } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

  it.each([
    ['an alias', 'const alias = cfg\nconst y = alias.v'],
    ['a holder', 'const holder = { cfg }\nconst y = holder.cfg.v'],
    ['an array holding it', 'const all = [cfg]\nconst y = all[0].v'],
    [
      'a holder of a holder',
      'const h1 = { cfg }\nconst h2 = [h1]\nconst y = h2[0].cfg.v',
    ],
    ['a spread of an alias', 'const alias = cfg\nconst y = { ...alias }'],
    [
      'a destructuring of an alias',
      'const alias = cfg\nconst { v: y } = alias',
    ],
    [
      'a holder given it at load',
      'const holder = {}\nholder.c = cfg\nconst y = holder.c.v',
    ],
  ])(
    'keeps a read through %s before a write of the original',
    async (_, reader) => {
      const r = await split(
        route(
          `const cfg = { v: 'OLD' }\n${reader}\ncfg.v = 'NEW'`,
          'loader: () => cfg,\ncomponent: () => y,',
        ),
      )
      expect(r.env).toContain(reader.split('\n').at(-1)!)
      expect(eager(r).map((d) => d.code)).toContain('eager-split:state')
    },
  )

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

  it.each([
    ['an array literal', "const plugins = []\nplugins.push('a')"],
    ['a Map', "const byId = /* @__PURE__ */ new Map()\nbyId.set('k', 1)"],
    ['a Set', "const seen = /* @__PURE__ */ new Set()\nseen.add('k')"],
  ])(
    'moves a built-in mutator call of %s with its binding past an effect (control)',
    async (_, decls) => {
      const name = /const (\w+)/.exec(decls)![1]!
      const r = await split(
        route(`${decls}\ntrack('second')`, `component: () => ${name},`),
      )
      expect(r.env).not.toContain(decls)
      expect(r.chunks.component).toContain(decls)
      expect(eager(r)).toEqual([])
    },
  )
})

// REVIEW-design2-final finding 1: a write through another name of an
// object (an alias, a holder, a destructured name) writes that object, so
// a read of it through any of its names is ordered against the write (O)
// or pinned by it (V), as a write through its first name is.
describe('state written through another name', () => {
  const route = (decls: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { snap, on, base, extra } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
    `)
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))
  const PURE = 'const y = /* @__PURE__ */ snap(cfg)'

  it.each([
    [
      'a destructuring before a write through an alias',
      'const { v: y } = cfg',
      'const alias = cfg\nalias.v = 11',
    ],
    [
      'a pure call before a write through a holder',
      PURE,
      'const holder = { c: cfg }\nholder.c.v = 3',
    ],
    [
      'a pure call before a `delete` through a `let` alias',
      PURE,
      'let alias = cfg\ndelete alias.v',
    ],
    [
      'a pure call before an `Object.assign` through an alias',
      PURE,
      'const alias = cfg\nObject.assign(alias, { v: 5 })',
    ],
    [
      'a pure call before a write through a conditional alias',
      PURE,
      "const alias = on ? cfg : null\nalias['v'] = 23",
    ],
    [
      'a pure call before a write through an array holding it',
      PURE,
      'const all = [cfg]\nall[0].v = 4',
    ],
    [
      'a pure call before a write through a destructured name',
      PURE,
      'const holder = { c: cfg }\nconst { c } = holder\nc.v = 4',
    ],
    [
      'a pure call before a function called at load writing through a holder',
      PURE,
      'const holder = { c: cfg }\nconst bump = () => { holder.c.v = 14 }\nbump()',
    ],
    [
      'a pure call through one alias before a write through another',
      'const y = /* @__PURE__ */ snap(a1)',
      'Object.assign(a2, { v: 5 })',
      'const a1 = cfg\nconst a2 = cfg',
    ],
  ])('keeps %s', async (_, reader, writer, aliases = '') => {
    const r = await split(
      route(
        ['const cfg = { v: 1 }', aliases, reader, writer]
          .filter(Boolean)
          .join('\n'),
        'loader: () => cfg,\ncomponent: () => y,',
      ),
    )
    expect(r.env).toContain(reader)
    expect(r.chunks.component).not.toContain(reader)
    expect(eager(r).map((d) => d.code)).toContain('eager-split:state')
  })

  it.each([
    [
      'a pure reader',
      PURE,
      'const holder = [cfg]\nfunction bump() { holder[0].v = 4 }',
    ],
    [
      'a member reader',
      'const y = cfg.v',
      'const holder = [cfg]\nfunction bump() { holder[0].v = 4 }',
    ],
    [
      'a reader through another holder',
      'const y = h1.c.v',
      'const h1 = { c: cfg }\nconst h2 = { c: cfg }\nconst bump = () => { h2.c.v = 15 }',
    ],
  ])(
    'keeps %s of an object a function writes through a holder (V)',
    async (_, reader, writer) => {
      const r = await split(
        route(
          `const cfg = { v: 1 }\n${writer}\n${reader}`,
          'beforeLoad: () => bump(),\ncomponent: () => y,',
        ),
      )
      expect(r.env).toContain(reader)
      expect(eager(r).map((d) => d.code)).toContain('eager-split:state')
    },
  )

  // Source: the executing placement property, toy planner, seed 305 (the
  // design 2 closing lane: red at its base, where the extracted `l4` saw
  // `{ v: 1 }` and the source gives `{ v: 7 }`)
  it('keeps an extracted export of an object written through a chain of aliases with the write', async () => {
    const r = await split(
      route(
        'const o1 = { v: 1 }\nlet l3 = o1\nexport const l4 = l3\nconst l6 = l4\nObject.assign(l6, { v: 7 })',
        'component: () => ({ l6 }),',
      ),
      { keys: ['component', 'loader'], extractExports: true },
    )
    expect(r.env).toContain(
      'export const l4 = l3\nconst l6 = l4\nObject.assign(l6, { v: 7 })',
    )
  })

  it('keeps a mutating method called through an alias with the object it writes', async () => {
    const r = await split(
      route(
        'export const columns = [base]\nconst cols = columns\ncols.push(extra)',
        'component: () => cols,',
      ),
    )
    expect(r.env).toContain('cols.push(extra)')
    expect(r.chunks.component).not.toContain('cols.push(extra)')
  })

  it.each([
    [
      'through an array holding it, read after the route',
      'const cfg = { v: 2 }\nconst holder = [cfg]',
      'beforeLoad: () => y,\ncomponent: (holder[0].v = 3, () => null),',
      'const y = snap(cfg)',
      'holder[0].v = 3',
      ['component'],
    ],
    [
      'through an alias, read by another chunk',
      'const cfg = { v: 1 }\nconst holder = { c: cfg }\nconst alias = cfg\nconst y = { ...holder.c }',
      'loader: () => y,\ncomponent: (alias.v = 6, () => null),',
      '',
      'alias.v = 6',
      ['loader', 'component'],
    ],
    [
      'through an alias of an array, read by another chunk',
      'const a1 = [2]\nconst y = a1.join()\nconst alias = a1',
      'loader: (alias[0] = 26, () => null),\ncomponent: () => y,',
      '',
      'alias[0] = 26',
      ['loader', 'component'],
    ],
    // Source: the executing placement property, toy planner, seed 85 (the
    // design 2 closing lane: red at its base)
    [
      "through an array holding it, read by another option's function",
      'const o0 = { v: 1 }\nconst h6 = [o0]',
      'loader: () => ({ o0 }),\ncomponent: (h6[0].v = 4, () => null),',
      '',
      'h6[0].v = 4',
      ['component'],
    ],
    // Source: REVIEW-design2-final, case A9 (the executing property's
    // minimal input)
    [
      'through a conditional alias of an extracted function',
      'export function F6() { return 14 }\nconst l8 = on ? F6 : null',
      "component: (l8['v'] = 23, () => null),",
      '',
      "l8['v'] = 23",
      ['component', 'loader'],
      // (the function the value writes stays where the write runs)
      'export function F6() { return 14 }',
    ],
  ] as Array<[string, string, string, string, string, Array<string>, string?]>)(
    'keeps an option value writing state %s in place',
    async (_, before, options, after, write, keys, extracted) => {
      const r = await split(
        route(before, options) + (after === '' ? '' : `${after}\n`),
        { keys, extractExports: extracted !== undefined },
      )
      if (extracted !== undefined) {
        expect(r.env).toContain(extracted)
      }
      expect(r.env).toContain(write)
      for (const key of keys) {
        expect(r.chunks[key] ?? '').not.toContain(write)
      }
    },
  )
})

// REVIEW-design2-final finding 4 (R100): every fix a kept declaration's
// warning offers frees what it names when applied.
describe('the fixes a kept declaration is offered work when applied', () => {
  const route = (decls: string, options: string, after = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { box, snap } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
      ${after}
    `)
  const lib = {
    '/app/lib.ts':
      'export const box = (x: unknown) => ({ x })\nexport const snap = (x: unknown) => x\n',
  }
  async function run(
    code: string,
    opts: {
      keys?: Array<string>
      extractExports?: boolean
      files?: Record<string, string>
      mode?: 'build' | 'dev'
    } = {},
  ) {
    const r = await split(code, { ...opts, files: { ...lib, ...opts.files } })
    return {
      ...r,
      eager: (r.main?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      ),
    }
  }

  // (c) and (d): an object an extracted export and split code both read
  it.each([
    ['a function', 'export const a = () => [reg]'],
    ['a value', 'export const a = [reg]'],
  ])(
    'puts the object an export and split code share into the export module (%s)',
    async (_, exported) => {
      // (recheck ruling A: the chunk imports it from there)
      const options = 'component: () => [reg, a],'
      const r = await run(route(`const reg = { v: 1 }\n${exported}`, options), {
        extractExports: true,
        mode: 'build',
      })
      expect(r.eager).toEqual([])
      expect(r.env).not.toContain('const reg')
    },
  )

  // (f) two registries written with each other: the use is the write
  it('offers only the move for two registries written with each other', async () => {
    const options = 'loader: () => a,\ncomponent: () => b,'
    const keys = ['loader', 'component']
    const decls = 'const a = []\nconst b = []\na.push(b)\nb.push(a)'
    const r = await run(route(decls, options), { keys })
    expect(r.eager.map((d) => d.code)).toEqual(['eager-split:state'])
    expect(r.eager[0]!.message).toContain(
      'move `a`, `b` and the statements writing them to their own module, so',
    )
    const f = await run(route("import { a, b } from './registries'", options), {
      keys,
      files: { '/app/registries.ts': decls.replace(/const/g, 'export const') },
    })
    expect(f.eager).toEqual([])
  })
})

describe('effectful declarations reading each other (R138)', () => {
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
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

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
      // (step 4: the pure writer is no effect, so this moved there; kept
      // as a guard, REVIEW-design2-step4 step 5 item 6)
      'a member read after a pure write',
      'const a = {}\na.v = 1\nconst x = [a.v]',
    ],
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
      expect(eager(r)).toEqual([])
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
    expect(eager(r)).toEqual([])
  })

  // an unknown call in the route options the client keeps runs after them
  // in the route module's body, and before them from the chunk: no order
  // rule
  it('moves the column helper and the columns when a route option the route module keeps calls an unknown function (no order rule)', async () => {
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
    expect(eager(r)).toEqual([])
  })

  // (`helper` goes to the two chunks' shared module, R151, which the
  // component's chunk imports and so evaluates first)
  it('moves a declaration reading a `const` that two chunks need', async () => {
    const r = await split(
      route(
        'const helper = make()\nconst cols = [helper.x()]',
        'component: () => cols,\nerrorComponent: () => helper,',
      ),
      { keys: ['component', 'errorComponent'] },
    )
    expect(r.env).not.toContain('make()')
    expect(r.env).not.toContain('const cols')
    expect(r.chunks.component).toContain('const cols = [helper.x()]')
    expect(r.chunks.component).toContain(
      "import { helper } from '/app/route.tsx?tsr-split=shared---component---errorComponent'",
    )
    expect(eager(r)).toEqual([])
  })

  // `a` stays (the loader reads it), `b` only the component uses. A `let`
  // nothing assigns reads like a `const`: the chunk imports the one
  // instance the route module evaluated first, whether or not `b` has an
  // effect of its own. An assigned one is judged by the writes, with that
  // reason: a write after the read would run before it from the chunk.
  // Source: NOTE-small-items 2d (R67's "a kept `let` still pins" revised;
  // the first and the fifth row stayed, reported `eager-split:reads`).
  it.each([
    ['a `let` nothing assigns', 'let a = make()\nconst b = [a, make()]'],
    ['a `let` nothing assigns, read alone', 'let a = make()\nconst b = [a]'],
    ['a `const`', 'const a = make()\nconst b = [a, make()]'],
    [
      'a `let` assigned before the read',
      'let a = make()\na = make()\nconst b = [a, make()]',
    ],
  ])(
    'moves a declaration reading a binding the route module keeps: %s',
    async (_, decls) => {
      const r = await split(
        route(decls, 'loader: () => a,\ncomponent: () => b,'),
      )
      expect(r.env).not.toContain('const b =')
      expect(r.chunks.component).toContain('const b = [a')
      expect(eager(r)).toEqual([])
    },
  )
  it.each([
    [
      'after the read',
      'let a = make()\nconst b = [a, make()]\na = make()',
      'loader: () => a,',
    ],
    [
      'by the loader',
      'let a = make()\nconst b = [a, make()]',
      'loader: () => (a = make()),',
    ],
  ])(
    'keeps a declaration reading a `let` the route module assigns %s, as reading written state',
    async (_, decls, loader) => {
      const r = await split(route(decls, `${loader}\ncomponent: () => b,`))
      expect(r.env).toContain('const b = [a, make()]')
      expect(eager(r).map((d) => d.code)).toEqual(['eager-split:state'])
      expect(eager(r)[0]!.message).toContain('uses `a` when the module loads')
    },
  )
})

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

  // the planners word what the core reports: a Hydrate chunk is named as
  // its boundary, and a module no planner describes is just "the module"
  it('names the split outputs and the module with the words their planners give', async () => {
    const code = dedent(`
      import { Hydrate } from 'toy-start'
      let n = 0
      export function inc() { n++ }
      const confetti = [n]
      export function Page() { return <Hydrate><p>{confetti}</p></Hydrate> }
    `)
    const host = new MemoryHost({ files: { '/app/mod.tsx': code } })
    const out = await host.compile('/app/mod.tsx', [toyHydratePlanner()], {
      env: envInfo({ mode: 'build' }),
    })
    expect(out!.diagnostics).toMatchObject([{ code: 'eager-split:state' }])
    expect(out!.diagnostics[0]!.message).toMatch(
      /^`confetti` in \/app\/mod\.tsx stays in the module because .*, so `confetti` can load with the split `<Hydrate>` boundary\.$/,
    )
  })

  it('reports an effect several split options need, writes and reads of state', async () => {
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
      registry.add(log)
      const client = make()
      const api = wrap(client)
      export const Route = createFileRoute('/')({
        loader: () => inc(),
        component: () => [first, snapshot, shared, registry, api],
        errorComponent: () => shared,
      })
    `)
    const r = await kept(code, ['component', 'errorComponent'])
    const byName: Record<string, (typeof r.diagnostics)[number]> =
      Object.fromEntries(
        r.diagnostics.map((d) => [/`(\w+)` in \//.exec(d.message)![1]!, d]),
      )
    // (R138: `client` and `api`, which reads it, move to the component's
    // chunk together; `api` was kept, reported `eager-split:reads`)
    // (no order rule: `first` moves past `log('ready')`; R146 amendment:
    // `registry.add(log)` changes `registry` only and moves with it; R151:
    // `shared`, two split options' effect, goes to their shared module;
    // recheck ruling C: `snapshot` stays because `inc`, which writes `n`
    // later, stays with the loader)
    expect(Object.keys(byName).sort()).toEqual(['snapshot'])
    expect(r.env).not.toContain('registry')
    expect(r.env).not.toContain('const api')
    expect(r.env).not.toContain('const first')
    expect(r.env).not.toContain('const shared')
    expect(byName.snapshot).toMatchObject({ code: 'eager-split:state' })
    // ("uses": the pin also covers a load that assigns the binding, R3-G1-2)
    expect(byName.snapshot!.message).toContain('uses `n`')
    for (const [name, d] of Object.entries(byName)) {
      expect(d.range, name).toMatchObject({
        start: code.indexOf(`${name} = `),
      })
    }
  })

  // a declaration of several bindings is named in the plural: `them`,
  // `their` where the words are the object of the sentence
  // several declarations a statement changes, kept with it
  // (tanstack.com's partner pages wrote both links in one statement)
  it('names several declarations a statement changes in the plural', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { Link } from './lib'
      const k = { search: '' }
      const homeUrl = new Link('https://example.com/')
      const docsUrl = new Link('https://example.com/docs')
      homeUrl.search = docsUrl.search = k.search
      export const Route = createFileRoute('/')({
        loader: () => k,
        component: () => [homeUrl, docsUrl],
      })
    `)
    const r = await kept(code)
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining(
        '`homeUrl`, `docsUrl` in /app/route.tsx stay in the route module because the statement on line 6, which changes them, stays there: it also uses `k`, which the route module keeps; run that statement in the code that needs them, so `homeUrl`, `docsUrl` can load with the split `component`.',
      ),
    ])
  })

  it('reports a declaration of several bindings in the plural', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { make } from './lib'
      const k = make()
      const [registry, index] = make()
      if (k.ready) { registry.start() }
      export const Route = createFileRoute('/')({
        loader: () => k,
        component: () => [registry, index],
      })
    `)
    const r = await kept(code)
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      expect.stringContaining(
        '`registry`, `index` in /app/route.tsx stay in the route module because the statement on line 5, which changes them, stays there: it also uses `k`, which the route module keeps; run that statement in the code that needs them',
      ),
    ])
  })

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
    expect(r.diagnostics).toEqual([])
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
    // the binding it reads (design 2 step 2 review, finding 6)
    expect(r.diagnostics[0]!.message).toContain('`n`')
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

  // R146 amendment: handing it to an import changes nothing; the call
  // follows what it reads
  it('moves a call handing a declaration to an import with it, unreported', async () => {
    const r = await kept(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { make, log } from './lib'
        const client = make()
        log(client)
        export const Route = createFileRoute('/')({ component: () => client })
      `),
    )
    expect(r.env).not.toContain('const client = make()')
    expect(r.env).not.toContain('log(client)')
    expect(r.diagnostics).toEqual([])
  })
})

// A call of a known package's pure export (`RecognizerTable.pureCalls`)
// with pure arguments is pure, recognised by import binding to the package's
// export (renamed, namespace member, a member of the default import of a
// package whose default export is its namespace: `pureDefaultNamespaces`).
describe('pure calls of known packages', () => {
  const recognizer = {
    ...EMPTY_RECOGNIZER,
    pureCalls: {
      'toy-router': new Set(['getRouteApi']),
      'toy-cjs': new Set(['getRouteApi']),
    },
    pureDefaultNamespaces: new Set(['toy-cjs']),
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
      kept: (main?.diagnostics ?? [])
        .filter((d) => d.code?.startsWith('eager-'))
        .map((d) => /`(\w+)` in \//.exec(d.message)![1]!),
    }
  }
  // tamery's API, read by two split options (one shared module, effects
  // too, R151: whether a call is an effect is a target fact, facts.test)
  const tamery = (imports: string, api: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      ${imports}
      const { useParams } = ${api}
      export const Route = createFileRoute('/')({
        component: () => useParams(),
        errorComponent: () => useParams(),
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
    ["import C from 'toy-cjs'", "C.getRouteApi('/x')"],
    ["import { default as C } from 'toy-cjs'", "C.getRouteApi('/x')"],
  ] as const

  it('moves a declaration calling one to the module the split options share', async () => {
    for (const [imports, api] of direct) {
      const r = await compile(tamery(imports, api))
      expect(r.env, api).not.toContain(api)
      expect(r.chunk, api).toContain('?tsr-split=shared---')
      expect(r.kept, api).toEqual([])
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
})

// rule L (DESIGN-order-guarantee-schemas.md, decision 1): a member read, a
// spread, `in`/`instanceof`, a call or `new` of a standard global (and a
// method of the value one returns, or of a literal) with pure arguments,
// a callback's body judged the same way, is no effect of placement's
// model: the declaration moves with its only reader, whatever follows it.
// Getters, proxies, iterators and `toString` stay outside the model (R97).
describe('language operations are no effect (rule L)', () => {
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
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

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
    expect(eager(r)).toEqual([])
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
    expect(eager(r)).toEqual([])
  })

  // a read and a later write of one object at load evaluate in one module,
  // in source order (`inOrder`): all of it in the chunk, or the read stays
  // with the write when the route module keeps the object (the loader)
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

  // the executing property (seed 1919): `o0` is reassigned, so it owns no
  // object, but its declaration creates the one `h3` holds: the write
  // through the holder writes `o0`
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

  // the executing property (seed 309): `'p' in l8` reads what `l8` holds
  // (`o0`, through a conditional alias): `in` reads through its name
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

  // round tools class A (placement-exec seeds 13017, 1302957, 1310446,
  // 1604480; router planner 1300510): the component also writes through
  // the holder, a write at an unknown time only its chunk makes (recheck
  // ruling C lets the read move there), but the read is still ordered
  // against the later write at load the route module keeps (the loader)
  it.each([
    ['a function', 'function Page() { h6.c.v = 12; return r11 }'],
    ['a wrapped function', 'hoc(function Page() { h6.c.v = 12; return r11 })'],
  ])(
    'keeps a read through a holder before a later write of the object when the component (%s) writes through the holder',
    async (_, component) => {
      const r = await split(
        dedent(`
          import { createFileRoute } from 'toy-router'
          import { hoc } from './lib'
          const o0 = { v: 1 }
          const h6 = { c: o0 }
          const r11 = [h6.c.v]
          o0.v = 5
          export const Route = createFileRoute('/x')({
            loader: () => o0,
            component: ${component},
          })
        `),
        { files: { '/app/lib.ts': 'export const hoc = (f) => f\n' } },
      )
      expect(r.env).toContain('const r11 = [h6.c.v]\no0.v = 5')
      const kept = r.main?.diagnostics ?? []
      expect(kept).toMatchObject([{ code: 'eager-split:state' }])
      // (the move names the holder `r11` reads `o0` through: left behind,
      // the new module would import it back from the route module)
      expect(kept[0]!.message).toContain(
        '`r11` in /app/route.tsx stays in the route module because it uses `o0` when the module loads, and the module writes `o0` then (line 6); move `r11`, `o0`, `h6` and the statements writing them when the module loads to their own module, so `r11` can load with the split `component`.',
      )
    },
  )

  // the move a `state` report offers works when applied: it names what the
  // moved code reads when the module loads, what reads a moved binding
  // before a moved write, and the code assigning a moved binding (an
  // imported binding is read-only); when that needs what the route module
  // keeps, no move is offered (guarantee 13)
  const stateMessage = async (decls: string, options: string, after = '') => {
    const r = await split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        ${decls}
        export const Route = createFileRoute('/x')({
          ${options}
        })
        ${after}
      `),
    )
    const kept = r.main?.diagnostics ?? []
    expect(kept).toMatchObject([{ code: 'eager-split:state' }])
    return kept[0]!.message
  }
  it.each([
    [
      'what reads a moved binding before its write',
      dedent(`
        const o0 = { v: 1 }
        const snap = o0.v
        const h6 = { c: o0 }
        const r11 = [h6.c.v]
        o0.v = 5
      `),
      'loader: () => snap,\n          component: function Page() { h6.c.v = 12; return [r11, snap] },',
      'move `r11`, `o0`, `snap`, `h6` and the statements writing them when the module loads to their own module, so `r11` can load',
    ],
    [
      'a statement reading a moved binding before its write',
      dedent(`
        const o0 = { v: 1 }
        console.log(o0.v)
        const h6 = { c: o0 }
        const r11 = [h6.c.v]
        o0.v = 5
      `),
      'loader: () => o0,\n          component: function Page() { h6.c.v = 12; return r11 },',
      'move `r11`, `o0`, `h6`, the statement on line 3 and the statements writing them when the module loads to their own module, so `r11` can load',
    ],
    [
      'a function it calls and what that reads',
      dedent(`
        const o0 = { v: 1 }
        const cfg = { k: 2 }
        function get() { return cfg.k }
        const r11 = [o0.v, get()]
        o0.v = 5
      `),
      'loader: () => o0,\n          component: () => r11,',
      'move `r11`, `o0`, `cfg`, `get` and the statements writing them when the module loads to their own module, so `r11` can load',
    ],
    [
      'the function assigning a moved binding',
      dedent(`
        let o0 = { v: 1 }
        const h6 = { c: o0 }
        const r11 = [h6.c.v]
        function reset() { o0 = { v: 0 } }
      `),
      'loader: () => { reset(); return o0 },\n          component: () => r11,',
      'use `o0` inside the code that needs it, or move `r11`, `o0`, `h6` and `reset` to their own module, so `r11` can load',
    ],
    [
      'a holder (a write at an unknown time)',
      dedent(`
        const o0 = { v: 1 }
        const h6 = { c: o0 }
        const r11 = [h6.c.v]
      `),
      'loader: () => { o0.v = 7; return o0 },\n          component: () => r11,',
      'use `o0` inside the code that needs it, or move `r11`, `o0` and `h6` to their own module, so `r11` can load',
    ],
  ])(
    'offers a move of a read before a write that names %s',
    async (_, decls, options, fix) => {
      expect(await stateMessage(decls, options)).toContain(fix)
    },
  )

  it.each([
    [
      'reads the route when it loads',
      'const o0 = { v: 1 }\n        const h6 = { c: o0 }',
      'loader: () => o0,\n          component: function Page() { h6.c.v = 12; return r11 },',
      dedent(`
        const r11 = [h6.c.v, Route.options]
        o0.v = 5
      `),
      "`r11` in /app/route.tsx stays in the route module because it uses `o0` when the module loads, and the module writes `o0` then (line 9); it can't move to a module of its own: that module would also need `Route`, which stays in the route module.",
    ],
    [
      'reads a binding a route option assigns',
      dedent(`
        let o0 = { v: 1 }
        const h6 = { c: o0 }
        const r11 = [h6.c.v]
      `),
      'loader: () => { o0 = { v: 0 }; return o0 },\n          component: () => r11,',
      '',
      '`r11` in /app/route.tsx stays in the route module because it uses `o0` when the module loads, and the module writes `o0`; use `o0` inside the code that needs it, so `r11` can load with the split `component`.',
    ],
  ])(
    'offers no move of a read before a write when it %s',
    async (_, decls, options, after, message) => {
      expect(await stateMessage(decls, options, after)).toBe(
        `[tanstack-router] ${message}`,
      )
    },
  )

  // the executing property (seeds 555, 1880), reported: a spread of an
  // object's member is no effect under rule L, and an unknown method called
  // on it in a route option's function writes nothing it is handed, so the
  // copy moves and may run after the call that changes the object (a
  // recognised builder's link is a write, R139, and keeps it)
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

  // no purity decides deletion (R148, Fable's review of order rule v2,
  // finding 2: `src3/`): an unread declaration (`JSON.parse(text)`, `new
  // URL(x)`, a getter) follows what it reads into its chunk, in every
  // environment, and the bundler decides
  describe('what nothing reads is never deleted', () => {
    it.each([
      ['client', 'const check = JSON.parse(cols.v)'],
      ['client', 'const url = new URL(cols.v)'],
      ['client', 'const got = cols.getter'],
      ['server', 'const check = JSON.parse(cols.v)'],
      ['server', 'const url = new URL(cols.v)'],
      ['server', 'const got = cols.getter'],
    ] as const)(
      'moves an unread declaration with what it reads (%s): `%s`',
      async (env, decl) => {
        const r = await split(
          dedent(`
            import { createFileRoute } from 'toy-router'
            import { box } from './lib'
            const cols = box(1)
            ${decl}
            export const Route = createFileRoute('/')({
              component: () => cols.v,
            })
          `),
          { env },
        )
        expect(r.env).not.toContain(decl)
        expect(r.env).not.toContain('box(1)')
        expect(r.chunks.component).toContain(`const cols = box(1)\n${decl}`)
      },
    )

    // and into an extracted export's module, a destination like a chunk
    // (R149, extended): the module runs when something uses the export
    describe('in an extracted export', () => {
      const compile = async (code: string, extracted: string) => {
        const host = new MemoryHost({ files: { '/app/route.tsx': code } })
        const planners = [
          toySplitPlanner({ keys: ['component'], extractExports: true }),
        ]
        const env = { env: envInfo({ mode: 'build' }) }
        const r = await host.compile('/app/route.tsx', planners, env)
        const e = await host.compile(
          `/app/route.tsx?tsr-split=export---${extracted}`,
          planners,
          env,
        )
        return { r, e }
      }

      it('moves an exported `new URL(text)` into its module', async () => {
        const { r, e } = await compile(
          dedent(`
            import { createFileRoute } from 'toy-router'
            const text = '{'
            export const url = new URL(text)
            export const Route = createFileRoute('/')({
              component: () => String(url),
            })
          `),
          'url',
        )
        expect(r?.code).not.toContain('new URL')
        expect(r?.code).toContain(
          "export { url } from '/app/route.tsx?tsr-split=export---url'",
        )
        expect(r?.diagnostics).toEqual([])
        expect(e?.code).toContain("const text = '{'\nconst url = new URL(text)")
      })

      it('moves an unexported `new URL(text)` only an extracted export reads into its module', async () => {
        const { r, e } = await compile(
          dedent(`
            import { createFileRoute } from 'toy-router'
            const text = '{'
            const url = new URL(text)
            export function Page() { return String(url) }
            export const Route = createFileRoute('/')({ component: Page })
          `),
          'Page',
        )
        expect(r?.code).not.toContain('new URL')
        expect(r?.code).toContain(
          "export { Page } from '/app/route.tsx?tsr-split=export---Page'",
        )
        expect(e?.code).toContain('const url = new URL(text)')
      })
    })
  })

  // a callback calling an unknown function runs in the export's module
  // (the executing property agrees: its values are the source's)
  it('moves an exported declaration whose callback calls an unknown function into its module', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { format } from './lib'
      const LABELS = { admin: 'Admin', user: 'User' }
      export const a = Object.keys(LABELS).map((k) => format(k))
      export const Route = createFileRoute('/')({ component: () => a })
    `)
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = { env: envInfo({ mode: 'build' }) }
    const r = await host.compile('/app/route.tsx', planners, env)
    expect(r?.code).not.toContain('format(k)')
    expect(r?.diagnostics).toEqual([])
    const e = await host.compile(
      '/app/route.tsx?tsr-split=export---a',
      planners,
      env,
    )
    expect(e?.code).toContain(
      "const LABELS = { admin: 'Admin', user: 'User' }\nconst a = Object.keys(LABELS).map((k) => format(k))",
    )
  })
})

// No order rule: code moves by the bindings it reads and writes; what moves
// keeps its source order in its chunk, what stays its order in the route
// module. A write through another name writes the object (design 2
// closing); a call the model does not know writes nothing it is handed.
describe('no order rule: bindings decide', () => {
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
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

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
    expect(eager(r)).toEqual([])
  })

  it('moves the snapshot when the call after it is not handed what it read', async () => {
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

  // the write through `alias` writes `cfg`: one cluster with it, which
  // `seen` reads before the write, so all of it moves together, in source
  // order (the snapshot sees `v: 1` as in the source)
  it('moves a snapshot with the object it reads and a write through another name after it, in source order', async () => {
    const decls =
      'const cfg = { v: 1 }\nconst alias = cfg\nconst seen = snap(cfg)\nalias.v = 2'
    const r = await split(route(decls, 'component: () => seen,'))
    expect(r.env).not.toContain('snap(cfg)')
    expect(r.chunks.component).toContain(decls)
  })

  // what no order rule reorders (DESIGN-order-none.md §3, DESIGN-order-
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
      expect(eager(r)).toEqual([])
    })

    // R65's case: the augmentations move with `Page`, in their order; `log()`
    // now runs before `eff1()`
    it('moves a declaration and its augmentations past a call between them (b, R65)', async () => {
      const r = await split(
        route(
          'function Page() { return Page.a + Page.b }\nPage.a = eff1()\nlog()\nPage.b = eff2()',
          'component: Page,',
        ),
      )
      expect(r.env).toContain('log()')
      expect(r.env).not.toContain('eff1()')
      expect(r.chunks.component).toContain('Page.a = eff1()\nPage.b = eff2()')
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

// A bare statement (it declares nothing: a call, an assignment, an
// `if`/`try`/loop block) moves into a chunk when every module binding it
// touches goes to that chunk (its bindings and the objects their values
// hold), in source order there; one touching an import, or bindings that
// stay or go elsewhere, stays in the route module.
describe('statements follow what they change', () => {
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
  const eager = (r: Awaited<ReturnType<typeof split>>) =>
    (r.main?.diagnostics ?? []).filter((d) => d.code?.startsWith('eager-'))

  // the user's examples (1) to (5)
  it('keeps keys `validateSearch` reads and moves the schema only the component reads (1)', async () => {
    const r = await split(
      route(
        "const ENTITY_KEYS = ['user', 'team'] as const\nconst entitySchema = z.enum(ENTITY_KEYS)",
        'validateSearch: z.object({ entity: z.enum(ENTITY_KEYS) }),\ncomponent: () => entitySchema,',
      ),
    )
    expect(r.env).toContain("const ENTITY_KEYS = ['user', 'team'] as const")
    expect(r.env).not.toContain('const entitySchema')
    expect(r.chunks.component).toContain(
      'const entitySchema = z.enum(ENTITY_KEYS)',
    )
    expect(r.chunks.component).toContain(
      "import { ENTITY_KEYS } from '/app/route.tsx'",
    )
    expect(eager(r)).toEqual([])
  })

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
    expect(eager(r)).toEqual([])
  })

  it('keeps a config `head` reads and moves the component value handed it (3)', async () => {
    const r = await split(
      route(
        "const cfg = { name: 'Settings' }\nconst title = cfg.name\nfunction Page() { return 'page' }",
        'head: () => ({ meta: [{ title }] }),\ncomponent: observer(Page, cfg),',
      ),
    )
    expect(r.env).toContain("const cfg = { name: 'Settings' }")
    expect(r.env).toContain('const title = cfg.name')
    expect(r.env).not.toContain('function Page')
    expect(r.chunks.component).toContain(
      "function Page() { return 'page' }\nconst TsrSplitComponent = observer(Page, cfg)",
    )
    expect(r.chunks.component).toContain("import { cfg } from '/app/route.tsx'")
  })

  it('moves a table, its snapshot and the call changing it to the component chunk, in source order (4)', async () => {
    const decls =
      "const table = createTable()\nconst columns = snapshot(table)\ntable.addColumn('x')"
    const r = await split(route(decls, 'component: () => columns,'))
    expect(r.env).not.toContain('createTable()')
    expect(r.env).not.toContain('addColumn')
    expect(r.chunks.component).toContain(decls)
    expect(eager(r)).toEqual([])
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

  it('moves a block statement with the binding it touches', async () => {
    const decls =
      "const table = createTable()\nconst columns = snapshot(table)\nif (columns.length === 0) { table.addColumn('x') }"
    const r = await split(route(decls, 'component: () => table,'))
    expect(r.env).not.toContain('createTable()')
    expect(r.chunks.component).toContain(decls)
  })

  it('moves statements between the declarations they change, in source order', async () => {
    const decls =
      "const table = createTable()\ntable.addColumn('x')\nconst columns = snapshot(table)\ntable.addColumn('y')"
    const r = await split(route(decls, 'component: () => columns,'))
    expect(r.env).not.toContain('addColumn')
    expect(r.chunks.component).toContain(decls)
  })

  // a mutator-named call writes its object (R65): the statement is in the
  // binding's cluster and touches nothing else; the cluster follows its
  // declaration's only needer
  it('moves a declaration with an effectful initialiser and a write of it by a statement', async () => {
    const decls = 'const d = createTable()\nd.add(1)'
    const r = await split(route(decls, 'loader: () => 0,\ncomponent: () => d,'))
    expect(r.env).not.toContain('d.add(1)')
    expect(r.chunks.component).toContain(decls)
    expect(eager(r)).toEqual([])
  })

  // what it only reads may stay: the chunk imports it
  // R151: bindings of two chunks it uses go with it to their shared module
  it('puts a statement using bindings of two chunks in their shared module, with them', async () => {
    const r = await split(
      route(
        'const a = createTable()\nconst b = createTable()\na.link(b)',
        'component: () => a,\nerrorComponent: () => b,',
      ),
      { keys: ['component', 'errorComponent'] },
    )
    expect(r.env).not.toContain('a.link(b)')
    expect(r.chunks.component).not.toContain('a.link(b)')
    expect(r.chunks.errorComponent).not.toContain('a.link(b)')
    expect(r.chunks.component).toContain('?tsr-split=shared---')
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

  // what the rule changes (reported): an effect outside the bindings the
  // compiler sees runs when the chunk loads
  describe('what it moves later', () => {
    it('moves an install call patching a global with the registry only the component reads', async () => {
      const decls = 'const registry = createRegistry()\nregistry.install()'
      const r = await split(route(decls, 'component: () => registry,'))
      expect(r.env).not.toContain('registry.install()')
      expect(r.chunks.component).toContain(decls)
    })

    // Firebase: the app only the component reads moves; a bare call
    // handing it to an import changes nothing and follows it (R146
    // amendment)
    it('moves an app only the component reads past `getAuth()`, and an emulator call with it', async () => {
      const r = await split(
        route(
          "const app = initializeApp({ projectId: 'p' })\nconst auth = getAuth()",
          'loader: () => auth,\ncomponent: () => app,',
        ),
      )
      expect(r.env).not.toContain('initializeApp(')
      expect(r.chunks.component).toContain('const app = initializeApp(')
      const k = await split(
        route(
          "const app = initializeApp({ projectId: 'p' })\nconnectAuthEmulator(getAuth(app), 'http://localhost')",
          'component: () => app,',
        ),
      )
      expect(k.env).not.toContain('initializeApp(')
      expect(k.chunks.component).toContain(
        "const app = initializeApp({ projectId: 'p' })\nconnectAuthEmulator(getAuth(app), 'http://localhost')",
      )
    })

    // the executing property (real planner, builders off: seeds 1302,
    // 1141, 1055): an unknown method of an object the route module or
    // another chunk keeps writes nothing it is handed, so a member read of
    // the object (rule L) moves past or away from it
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
      // (R146 amendment: both calls change `b4`, which only the
      // component's read needs: all of it moves, in source order)
      it('moves the read with the calls around it (seed 1302)', async () => {
        const decls =
          'const b4 = mw()\nrun(() => { b4.server(() => 24) })\nconst r12 = b4.o.n\nb4.server(() => 25)'
        const r = await split(mwRoute(decls, 'component: () => ({ r12 }),'))
        expect(r.env).not.toContain('b4')
        expect(r.chunks.component).toContain(decls)
      })

      // (`b9`, two chunks' effect, goes to their shared module: R151)
      it('moves the read and the earlier call to two chunks (seed 1141)', async () => {
        const r = await split(
          mwRoute(
            'const b9 = mw()\nconst b12 = b9.client(() => 7)\nconst r14 = b9.o.n',
            'component: () => ({ b12 }),\nerrorComponent: () => ({ r14 }),',
          ),
          { keys: ['component', 'errorComponent'] },
        )
        expect(r.env).not.toContain('const b9 = mw()')
        expect(r.chunks.component).toContain(
          "import { b9 } from '/app/route.tsx?tsr-split=shared---component---errorComponent'",
        )
        expect(r.chunks.component).toContain('const b12 = b9.client(() => 7)')
        expect(r.chunks.errorComponent).toContain('const r14 = b9.o.n')
      })

      it('moves the copy away from a call in a split option value (seed 1055)', async () => {
        const r = await split(
          mwRoute(
            'const b4 = mw()\nconst r6 = { ...b4.o }',
            'loader: (b4.server(() => 16), () => ({})),\ncomponent: () => ({ r6 }),',
          ),
          { keys: ['loader', 'component'] },
        )
        // (`b4`, two chunks' effect, goes to their shared module: R151)
        expect(r.env).not.toContain('const b4 = mw()')
        expect(r.chunks.loader).toContain('b4.server(() => 16)')
        expect(r.chunks.component).toContain('const r6 = { ...b4.o }')
      })
    })

    // a value only the component reads moves past a bare call after it, and
    // nothing is reported (it is no kept declaration)
    it('moves a value past a bare call after it, unreported', async () => {
      const r = await split(
        route(
          'const table = createTable()\nconnectAuthEmulator()',
          'component: () => table,',
        ),
      )
      expect(r.env).not.toContain('createTable()')
      expect(r.env).toContain('connectAuthEmulator()')
      expect(eager(r)).toEqual([])
    })

    // R149 answer D, accepted break: a callback registered at load moves
    // with the binding it writes, so it is registered when the chunk loads,
    // not when the route module does (the component's `flags` fills once
    // its chunk has loaded and the promise settles)
    it.each([
      ['assigns', 'let flags = {}\nloadFlags().then((f) => { flags = f })'],
      [
        'writes a member of',
        'const flags = { beta: false }\nloadFlags().then((f) => { flags.beta = f.beta })',
      ],
    ])(
      'moves a callback registered at load with the binding it %s (accepted break D)',
      async (_, decls) => {
        const r = await split(
          route(
            decls,
            'component: () => flags,',
            "import { loadFlags } from './flags'",
          ),
        )
        expect(r.chunks.component).toContain(decls)
        expect(r.env).not.toContain('loadFlags()')
        expect(eager(r)).toEqual([])
      },
    )

    // R149 answer F, accepted break: a call's result is not the object it
    // was handed, so a write through it is no write of that object, and a
    // read of the object moves past it (the executing property, toy
    // planner: seeds 4289, 8800, 9610, 5241). The component's `keys` sees
    // `'theme,dark'`, the source gives `'theme'`.
    it('moves a read of an object past a write through an unknown call result (seed 4289)', async () => {
      const decls =
        "const settings = { theme: 'light' }\nconst keys = Object.keys(settings).join()\nconst store = reactive(settings)\nconst dark = store.dark\nObject.assign(store, { dark: true })"
      const r = await split(
        route(
          decls,
          'component: () => keys,\nerrorComponent: () => dark,',
          "import { reactive } from './store'",
        ),
        { keys: ['component', 'errorComponent'] },
      )
      expect(r.env).toContain(
        'const store = reactive(settings)\nconst dark = store.dark\nObject.assign(store, { dark: true })',
      )
      expect(r.env).not.toContain('Object.keys(settings)')
      expect(r.chunks.component).toContain(
        'const keys = Object.keys(settings).join()',
      )
      // (only `dark`, which reads `store` before its write, is reported)
      expect(eager(r)).toMatchObject([{ code: 'eager-split:state' }])
      expect(eager(r)[0]!.message).toContain('`dark` in /app/route.tsx')
    })
  })
})

// R146 amendment (the user's rule): what keeps a bare statement in the route
// module is what it changes (the objects it writes or calls a method on,
// directly or in the local functions it calls), not what it names. It stays
// when it changes something the rest of the app can see: another module's
// object, a global, `import.meta`, a dynamically imported module; else it
// follows the bindings it changes. Calling or passing an import changes
// nothing. One rule for statements and a declaration's own writes.
// R149 (the user's rule): a statement follows the module bindings it uses
// (reads or changes, and what they hold, also in the local functions it
// calls) into the one chunk they all go to; otherwise it stays. Nothing
// outside the module (imports, globals, `import.meta`, `import()`) keeps
// it; a statement using no binding that moves stays; a statement using a
// binding that stays (exported, needed by the route module or another
// chunk) stays. A declaration's own writes are judged the same way.
describe('statements follow the bindings they use (R149)', () => {
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
  /** `decls` in the route module, in order, and none of it in the component chunk. */
  const stays = (r: Awaited<ReturnType<typeof split>>, decls: string) => {
    expect(r.env).toContain(decls)
    for (const line of decls.split('\n')) {
      expect(r.chunks.component).not.toContain(line)
    }
  }
  /** `decls` in the component chunk, in order, and none of it in the route module. */
  const moves = (r: Awaited<ReturnType<typeof split>>, decls: string) => {
    expect(r.chunks.component).toContain(decls)
    for (const line of decls.split('\n')) {
      expect(r.env).not.toContain(line)
    }
  }

  describe('moves with the bindings it uses, whatever outside the module it touches', () => {
    it.each([
      ["another module's object", "const cfg = { dsn: 'x' }\nSentry.init(cfg)"],
      ['a global', "const cfg = { dsn: 'x' }\nwindow.appConfig = cfg"],
      ['`console`', "const cfg = { dsn: 'x' }\nconsole.log(cfg)"],
      [
        'an analytics call',
        "const cfg = { dsn: 'x' }\nanalytics.track(cfg.dsn)",
      ],
      [
        "the module's `import.meta.hot`",
        "const cfg = { dsn: 'x' }\nif (import.meta.hot) { import.meta.hot.dispose(() => cfg.reset()) }",
      ],
      [
        'a dynamically imported module',
        "const cfg = { dsn: 'x' }\nimport('./a').then((m) => m.track(cfg))",
      ],
      [
        "another module's object through a local function it calls",
        "const cfg = { dsn: 'x' }\nfunction start() { Sentry.init(cfg) }\nstart()",
      ],
      [
        "a declaration's own write calling a method of another module's object",
        'const cfg = {}\ncfg.client = Sentry.getClient()',
      ],
    ])('%s', async (_, decls) => {
      const r = await split(route(decls, 'component: () => cfg,'))
      moves(r, decls)
    })

    it.each([
      [
        'an array the component reads',
        'const plugins = []\nplugins.push(sentryPlugin())',
        'plugins',
      ],
      [
        'a store handed an import',
        'const store = createStore()\nstore.add(persistPlugin)',
        'store',
      ],
      [
        'a member assigned an imported call',
        'const reg = {}\nreg.client = createClient()',
        'reg',
      ],
      [
        'the same in an `if`',
        'const reg = {}\nif (on) { reg.client = createClient() }',
        'reg',
      ],
      [
        "a component's static props",
        "function Page() { return 'page' }\nPage.propTypes = { x: PropTypes.string }",
        'Page',
      ],
    ])('%s', async (_, decls, name) => {
      const r = await split(route(decls, `component: () => ${name},`))
      moves(r, decls)
    })

    // a built-in that changes its argument (`Reflect.set`, as
    // `Object.assign`): the statement follows the enum after the read
    it('a built-in changing a binding after a read of it', async () => {
      const decls =
        "enum E { A = 'OLD' }\nconst y = E.A\nReflect.set(E, 'A', 'NEW')"
      const r = await split(route(decls, 'component: () => y,'))
      moves(r, decls)
    })
  })

  describe('stays when a binding it uses stays, or it uses none that moves', () => {
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

    // finding 5: the binding a local function it calls changes stays
    it('a binding the route module keeps, through a local function it calls', async () => {
      const decls =
        "const table = createTable()\nfunction setup() { table.addColumn('x') }\nsetup()"
      const r = await split(
        route(decls, 'validateSearch: table.schema,\ncomponent: () => setup,'),
      )
      stays(r, decls)
    })

    it.each([
      ['with a binding it changes', 'if (on) { d.init(); fill(k) }'],
      ['alone', 'fill(k)'],
    ])(
      'a binding the route module keeps, handed to a local function it calls (%s)',
      async (_, statement) => {
        const decls = `const k = createTable()\nconst d = createTable()\nfunction fill(o) { o.v = 3 }\n${statement}`
        const r = await split(
          route(decls, 'loader: () => k,\ncomponent: () => d,'),
        )
        expect(r.env).toContain(statement)
        expect(r.chunks.component).not.toContain(statement)
      },
    )

    it('a binding the route module keeps that it only reads', async () => {
      const decls =
        "const LABELS = { a: 'A' }\nconst table = createTable()\ntable.addColumn(LABELS)"
      const r = await split(
        route(decls, 'loader: () => LABELS,\ncomponent: () => table,'),
      )
      stays(r, decls)
    })

    // review finding 1: an export is used outside the route module
    it.each([
      ['it changes', 'later(() => { flags.beta = true })'],
      ['it reads', 'analytics.track(flags)'],
    ])('an exported binding %s', async (_, statement) => {
      const r = await split(
        route(
          `export const flags = { beta: false }\n${statement}`,
          'component: () => flags.beta,',
        ),
        { extractExports: true },
      )
      expect(r.env).toContain(statement)
      expect(r.chunks.component).not.toContain(statement)
    })

    // review finding 7: reading bindings of two chunks, with or without a
    // later write of one of them: one answer, their shared module (R151)
    it.each([
      ['', 'without a later write'],
      ['\ncfg.n = 1', 'with a later write'],
    ])('bindings of two chunks it reads%s (%s)', async (after) => {
      const decls = `const cfg = { n: 0 }\nconst table = { x: 1 }\nanalytics.log(table, cfg)${after}`
      const r = await split(
        route(decls, 'loader: () => cfg,\ncomponent: () => table.x,'),
        { keys: ['loader', 'component'] },
      )
      expect(r.env).not.toContain('analytics.log')
      expect(r.chunks.loader).not.toContain('analytics.log')
      expect(r.chunks.component).not.toContain('analytics.log')
      expect(r.chunks.component).toContain('?tsr-split=shared---')
    })
  })
})

// R151 (user + architect): a lazy shared module may hold effects. An
// effectful cluster several split outputs need (and nothing that stays
// needs) goes to one lazy shared module those outputs import, evaluated
// once when the first of them loads; a statement and dead code (R148) whose
// bindings go to several split outputs join them there.
describe('lazy shared modules hold effects (R151)', () => {
  const keys = ['component', 'loader']
  async function compile(
    code: string,
    opts: { extractExports?: boolean } = {},
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toySplitPlanner({ keys, extractExports: opts.extractExports }),
    ]
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
  const lineOf = (code: string, needle: string) =>
    code.slice(0, code.indexOf(needle)).split('\n').length

  it('puts a statement using bindings of two split options in one shared module with them', async () => {
    const body = 'const a = { x: 1 }\nconst b = { y: 2 }\nlink(a, b)'
    const r = await compile(
      route(body, 'component: () => a.x, loader: () => b.y'),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain('link(a, b)')
    expect(r.env).not.toContain('{ x: 1 }')
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0]).toContain(body)
    expect(r.chunks.component).not.toContain('link(a, b)')
    expect(r.chunks.loader).not.toContain('link(a, b)')
  })

  it('puts an effectful declaration two split options read in one shared module', async () => {
    const r = await compile(
      route('const x = make()', 'component: () => x, loader: () => x'),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain('make()')
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0]).toContain('const x = make()')
  })

  it('puts unused code reading bindings of two split options in one shared module with them, and says so', async () => {
    const body =
      'const a = { x: 1 }\nconst b = { y: 2 }\nfunction debugDump() { return [a, b] }'
    const options = 'component: () => a.x, loader: () => b.y'
    const code = route(body, options)
    const r = await compile(code)
    expect(r.env).not.toContain('debugDump')
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0]).toContain(body)
    expect(r.diagnostics).toMatchObject([
      {
        code: 'shared-split:unused',
        range: { start: code.indexOf('function debugDump') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain(
      `unused \`debugDump\` (line ${lineOf(code, 'function debugDump')}) puts \`a\` and \`b\` in one shared module the split \`component\` and \`loader\` import; delete \`debugDump\`, so each loads with the split code that needs it`,
    )
    // each chunk imports from the shared module only what it uses (recheck
    // finding 8)
    expect(r.chunks.component).toMatch(/import \{ a \} from '[^']*shared---/)
    expect(r.chunks.loader).toMatch(/import \{ b \} from '[^']*shared---/)
    // the fix
    const f = await compile(
      route('const a = { x: 1 }\nconst b = { y: 2 }', options),
    )
    expect(f.diagnostics).toEqual([])
    expect(f.shared).toEqual([])
    expect(f.chunks.component).toContain('const a = { x: 1 }')
    expect(f.chunks.loader).toContain('const b = { y: 2 }')
  })

  // careflow: unused code reading an extracted export and a split
  // option's binding goes into the export's module with that binding, which
  // the chunk imports from there (recheck ruling A)
  it('puts unused code reading an extracted export and a split binding into the export module', async () => {
    const body =
      "const card = { c: 1 }\nexport function Title() { return 't' }\nfunction CheckStep() { return [card, Title] }"
    const r = await compile(route(body, 'component: () => [card, Title]'), {
      extractExports: true,
    })
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain('function CheckStep()')
    expect(r.env).not.toContain('{ c: 1 }')
  })

  // unused code keeping a binding the route module keeps: the warning names
  // what it keeps there
  it('keeps unused code reading a binding the route module keeps, and says what it keeps', async () => {
    const body =
      'const card = { c: 1 }\nconst k = { k: 1 }\nfunction CheckStep() { return [card, k] }'
    const options = 'component: () => card,\n      validateSearch: () => k'
    const code = route(body, options)
    const r = await compile(code)
    expect(r.env).toContain('function CheckStep()')
    expect(r.diagnostics).toMatchObject([
      {
        code: 'eager-split:unused',
        range: { start: code.indexOf('function CheckStep') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain(
      `unused \`CheckStep\` (line ${lineOf(code, 'function CheckStep')}) keeps \`card\` in the route module; delete \`CheckStep\`, so it can load with the split code that needs it`,
    )
    // the fix
    const f = await compile(
      route('const card = { c: 1 }\nconst k = { k: 1 }', options),
    )
    expect(f.diagnostics).toEqual([])
    expect(f.env).not.toContain('{ c: 1 }')
  })

  // a follower of one binding whose place grows to several split outputs
  // (another follower shares it) joins them too, as round 0 would have
  // (review probes b20, b12): nothing stays; only the unused code that put
  // the bindings together is reported
  it('joins a follower whose binding another follower shares', async () => {
    const body =
      'const cfg = { n: 0 }\nconst table = make()\ntable.setup(cfg)\nlink(cfg)\ncfg.inc()'
    const r = await compile(
      route(body, 'component: () => table.x, loader: () => cfg'),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain('table.setup(cfg)')
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0]).toContain(body)
  })

  it('reports only the unused code that puts bindings together', async () => {
    const body =
      'const a = make()\nconst b = make()\nfunction Unused() { return [a, b] }\nfunction UnusedA() { return a }'
    const code = route(body, 'component: () => a.x, loader: () => b')
    const r = await compile(code)
    expect(r.env).not.toContain('Unused')
    expect(r.shared[0]).toContain(body)
    expect(r.diagnostics).toMatchObject([
      {
        code: 'shared-split:unused',
        range: { start: code.indexOf('function Unused()') },
      },
    ])
  })

  // recheck finding 2: unused code is reported only when deleting it
  // separates the bindings: not beside a binding both split options use
  // already (m06), nor beside a statement joining them too (m10)
  it.each([
    [
      'a binding both split options use',
      'const a = make()\nconst l4 = a\nconst l11 = l4',
      'component: () => l4, loader: () => l4',
    ],
    [
      'a statement joining them too',
      'const a = make()\nconst b = make()\nlink(a, b)\nfunction debugDump() { return [a, b] }',
      'component: () => a.x, loader: () => b',
    ],
  ])('reports no unused code beside %s', async (_, body, options) => {
    const r = await compile(route(body, options))
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0]).toContain(body)
    expect(r.diagnostics).toEqual([])
  })

  // (unused code using that code is named with it: deleting `inner` alone
  // would leave `outer` calling nothing, m12)
  it('names an unused chain putting the bindings of two split options together in one report', async () => {
    const body =
      'const a = make()\nconst b = make()\nfunction inner() { return [a, b] }\nfunction outer() { return inner() }'
    const options = 'component: () => a.x, loader: () => b'
    const code = route(body, options)
    const r = await compile(code)
    expect(r.diagnostics).toMatchObject([
      {
        code: 'shared-split:unused',
        range: { start: code.indexOf('function inner') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain(
      `unused \`inner\` (line ${lineOf(code, 'function inner')}) and \`outer\` (line ${lineOf(code, 'function outer')}) put \`a\` and \`b\` in one shared module the split \`component\` and \`loader\` import; delete them`,
    )
  })

  // (several unused declarations joining the same bindings: deleting one
  // changes nothing, so one report names them all, m09)
  it('names every unused declaration joining the same bindings in one report', async () => {
    const body =
      'const a = make()\nconst b = make()\nfunction dumpA() { return [a, b] }\nfunction dumpB() { return [b, a] }'
    const options = 'component: () => a.x, loader: () => b'
    const code = route(body, options)
    const r = await compile(code)
    expect(r.diagnostics).toMatchObject([
      {
        code: 'shared-split:unused',
        range: { start: code.indexOf('function dumpA') },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain(
      `unused \`dumpA\` (line ${lineOf(code, 'function dumpA')}) and \`dumpB\` (line ${lineOf(code, 'function dumpB')}) put \`a\` and \`b\` in one shared module the split \`component\` and \`loader\` import; delete them, so each loads with the split code that needs it`,
    )
    // the fix
    const f = await compile(
      route('const a = make()\nconst b = make()', options),
    )
    expect(f.diagnostics).toEqual([])
    expect(f.shared).toEqual([])
    expect(f.chunks.component).toContain('const a = make()')
    expect(f.chunks.loader).toContain('const b = make()')
  })

  // recheck ruling D (R148): an unused chain follows what it reads
  // transitively, into one chunk (m15) or two chunks' shared module (m12)
  it.each([
    ['one split option', 'component: () => a.x, loader: () => 1', false],
    ['two split options', 'component: () => a.x, loader: () => b', true],
  ])(
    'puts an unused chain reading bindings of %s with them',
    async (_, options, shared) => {
      const body =
        'const a = make()\nconst b = make()\nfunction inner() { return [a, b] }\nfunction outer() { return inner() }'
      const code = route(
        shared
          ? body
          : body.replace('const b = make()\n', '').replace('[a, b]', 'a'),
        options,
      )
      const r = await compile(code)
      expect(r.env).not.toContain('function inner()')
      expect(r.env).not.toContain('function outer()')
      expect(r.env).not.toContain('make()')
      if (shared) {
        expect(r.shared[0]).toContain(
          'function inner() { return [a, b] }\nfunction outer() { return inner() }',
        )
      } else {
        expect(r.chunks.component).toContain(
          'function inner() { return a }\nfunction outer() { return inner() }',
        )
      }
    },
  )

  // an extraction no chunk needs is cancelled; a statement that went into
  // its module is judged again, and stays with the binding the route module
  // now keeps, naming it
  it('judges a statement again when the module it joined is cancelled', async () => {
    const code = route(
      'const e = make()\nconst d = make()\nlink(d, e)\nexport function getE() { return e }',
      'component: () => d',
    )
    const r = await compile(code, { extractExports: true })
    expect(r.env).toContain('link(d, e)')
    expect(r.diagnostics).toMatchObject([{ code: 'eager-split:written' }])
    expect(r.diagnostics[0]!.message).toContain(
      'it also uses `e`, which the route module keeps',
    )
  })

  // recheck ruling C: a load-time reader whose every later writer is in
  // the one chunk it would move to moves there (the chunk evaluates it
  // before any of its functions run: V does not hold), m18
  it('moves a load-time reader whose only later writer is in its chunk', async () => {
    const decls = 'const cache = new Map()\nlink(cache)'
    const r = await compile(
      route(
        decls,
        "component: () => { cache.set('a', 1); return cache }, loader: () => 1",
      ),
    )
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain('link(cache)')
    expect(r.chunks.component).toContain(decls)
  })

  // ... and stays when a later writer is elsewhere (V)
  it('keeps a load-time reader a later writer in another chunk writes', async () => {
    const r = await compile(
      route(
        'const cache = new Map()\nlink(cache)',
        "component: () => cache, loader: () => { cache.set('a', 1); return 1 }",
      ),
    )
    expect(r.env).toContain('link(cache)')
  })

  // the executing property (toy planner, seed 11838): a binding a split
  // option writes lives with that writer (single-writer rule); unused code
  // joined with it goes there too, or the shared module would import the
  // chunk that imports it (a cycle: `w14` read before initialisation)
  it('puts a joined follower with its binding where the single-writer rule homes it', async () => {
    const code = route(
      'let o10 = { v: 6 }\nconst w14 = Object.assign(o10, { p: 8 })\nconst l17 = w14 ? 1 : 0',
      'component: () => w14, loader: () => { o10 = w14; return 1 }',
    )
    const r = await compile(code)
    for (const m of r.shared) {
      expect(m).not.toContain('?tsr-split=loader')
    }
    expect(r.chunks.loader).toContain('const l17 = w14 ? 1 : 0')
  })

  // (the router-plugin pages: an effectful binding exported under another
  // name or by default, which the component reads: extracted with its
  // effect, R150; never judged as a split option's slot, which pinned it
  // and listed one needer)
  it.each(['export { store as appStore }', 'export default store'])(
    'extracts an effectful binding exported as `%s` that the component reads',
    async (tail) => {
      const r = await compile(
        route(`const store = make()\n${tail}`, 'component: () => store'),
        { extractExports: true },
      )
      expect(r.diagnostics).toEqual([])
      expect(r.env).not.toContain('make()')
      expect(r.chunks.component).toContain('?tsr-split=export---')
    },
  )

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

// Finding 3 (part B) and the fresh review's finding 5: a declaration a
// statement uses stays with that statement, and the warning says why the
// statement stays (a binding it also uses that the route module keeps or
// another split option uses, several split options using what it changes,
// code that runs later changing it, or dead code that reads it), with
// `changes` or `uses` as the statement does each; each offered fix, applied,
// lets the declaration load with its chunk (R100)
describe('eager-split:written: why a statement that changes it stays', () => {
  async function report(
    code: string,
    keys = ['component'],
    files: Record<string, string> = {},
    extractExports = false,
  ) {
    const host = new MemoryHost({
      files: { '/app/route.tsx': code, ...files },
    })
    const planners = [toySplitPlanner({ keys, extractExports })]
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
      diagnostics: (out?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      ),
    }
  }
  const route = (body: string, options: string) =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import * as Sentry from '@sentry/react'
      import { make } from './lib'
      const on = true
      ${body.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({ ${options} })
    `)
  const lineOf = (code: string, needle: string) =>
    code.slice(0, code.indexOf(needle)).split('\n').length
  /** One `eager-split:written` at `name`'s declaration naming the statement's line and `cause`. */
  const written = (
    r: Awaited<ReturnType<typeof report>>,
    code: string,
    name: string,
    statement: string,
    cause: string,
  ) => {
    expect(r.diagnostics).toMatchObject([
      {
        code: 'eager-split:written',
        range: { start: code.indexOf(`${name} = `) },
      },
    ])
    expect(r.diagnostics[0]!.message).toContain(
      `the statement on line ${lineOf(code, statement)}`,
    )
    expect(r.diagnostics[0]!.message).toContain(cause)
  }
  /** The end of the `written` message when code the route module keeps sees what the statement changes: no move keeps what that code sees. */
  const seenBy = (code: string, reader: string) =>
    `, which the route module's code uses on line ${lineOf(code, reader)}; moving or deleting that statement would change what that code sees.`

  // the statement changes `k`, which the loader reads: run in the code
  // that needs `d`, it would change `k` later than the loader reads it, so
  // no move is offered (the statement puts `d` in `k`; `d` loads with the
  // route module)
  it('a binding the route module keeps that one call also changes', async () => {
    const statement = 'k.link(d)'
    const options = 'loader: () => k, component: () => d'
    const code = route(
      `const k = make()\nconst d = make()\n${statement}`,
      options,
    )
    written(
      await report(code),
      code,
      'd',
      statement,
      `which uses it, stays there: it also changes \`k\`${seenBy(code, 'loader')}`,
    )
  })

  // a method the mutation model knows (`Set.add`, `Array.push`, `Map.set`)
  // writes only the receiver: the statement joins its cluster, which the
  // route module keeps, and keeps the binding it uses with one warning, as
  // a call it does not know does (phase 6 step 3, P04b written with `add`)
  it.each([
    ['add', 'new Set()', 'k.add(d)'],
    ['push', '[]', 'k.push(d)'],
    ['set', 'new Map()', "k.set('d', d)"],
  ])(
    'a binding the route module keeps that a known method (%s) changes',
    async (_, init, statement) => {
      const options = 'loader: () => k, component: () => d'
      const code = route(
        `const k = ${init}\nconst d = make()\n${statement}`,
        options,
      )
      written(
        await report(code),
        code,
        'd',
        statement,
        `which uses it, stays there: it also changes \`k\`${seenBy(code, 'loader')}`,
      )
    },
  )

  // the same through what the statement uses (`unitChanges`): a holder of
  // it, and an exported binding, as with a call the model does not know
  it.each([
    [
      'a holder of it',
      'const k = new Set()\nconst d = make()\nconst h = { d }',
      'k.add(h)',
      false,
    ],
    [
      'an exported binding',
      'const k = new Set()\nexport const d = make()',
      'k.add(d)',
      true,
    ],
  ])(
    'a binding the route module keeps that a known method changes, using %s',
    async (_, decls, statement, extract) => {
      const options = 'loader: () => k, component: () => d'
      const code = route(`${decls}\n${statement}`, options)
      written(
        await report(code, undefined, {}, extract),
        code,
        'd',
        statement,
        `which uses it, stays there: it also changes \`k\`${seenBy(code, 'loader')}`,
      )
    },
  )

  // an unused declaration calling the method (`const n = k.add(d).size`)
  // is such a statement too: it was silent with a known method, and its
  // twin with an unknown one asked to delete it, which changes `k` for the
  // loader as moving it does
  it.each([
    ['a known method', 'new Set()', 'k.add(d)'],
    ['an unknown call', 'make()', 'k.link(d)'],
  ])(
    'a binding the route module keeps that an unused declaration changes with %s',
    async (_, init, call) => {
      const statement = `n = ${call}.size`
      const options = 'beforeLoad: () => k.size, component: () => d'
      const code = route(
        `const k = ${init}\nconst d = make()\nconst ${statement}`,
        options,
      )
      written(
        await report(code),
        code,
        'd',
        statement,
        `which uses it, stays there: it also changes \`k\`${seenBy(code, 'beforeLoad')}`,
      )
    },
  )

  // the route options' declaration writing a binding at load (a component
  // value `(n = 5, () => …)`) joins its cluster too, but is no unused
  // declaration: exported, holding the options (spelling-variants suites,
  // code-splitter-value-own-writes `flags`)
  it('reports no binding the route options use as kept by their declaration', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      let n = 1
      export const Route = createFileRoute('/')({
        loader: () => flags,
        component: (n = 5, () => flags),
      })
      const flags = [n]
    `)
    const r = await report(code, ['loader', 'component'])
    expect(
      r.diagnostics.filter((d) => d.code === 'eager-split:written'),
    ).toEqual([])
  })

  // what the route module reads of `k` only before the statement, at load,
  // does not see it: the statement runs in the code that needs `d`
  it('a binding the route module keeps that a statement changes after the route module read it', async () => {
    const options = 'loader: () => n, component: () => d'
    const code = route(
      'const k = new Set()\nconst n = k.size\nconst d = make()\nk.add(d)',
      options,
    )
    written(
      await report(code),
      code,
      'd',
      'k.add(d)',
      'which uses it, stays there: it also changes `k`, which the route module keeps; run that statement in the code that needs it, so `d` can load with the split `component`.',
    )
    // the fix: the call in the code that needs `d`
    const f = await report(
      route(
        'const k = new Set()\nconst n = k.size\nconst d = make()',
        'loader: () => n, component: () => (k.add(d), d)',
      ),
    )
    expect(f.diagnostics).toEqual([])
    expect(f.chunks.component).toContain('const d = make()')
  })

  it('a binding the route module keeps that the statement only uses', async () => {
    const statement = 'table.setup(cfg)'
    const options = 'loader: () => cfg, component: () => table'
    const code = route(
      `const cfg = { n: 0 }\nconst table = make()\n${statement}\ncfg.n = 1`,
      options,
    )
    written(
      await report(code),
      code,
      'table',
      statement,
      'which changes it, stays there: it also uses `cfg`, which the route module keeps',
    )
  })

  // one statement changing a binding of one chunk and using one of
  // another (review probe b33), two statements each changing one and using
  // the other (e04), a statement of several statements (R151): one shared
  // module for all of it, nothing reported
  it.each([
    ['one statement', 'a.connect(b)'],
    ['two statements', 'a.link(b)\nb.link(a)'],
    ['a statement of several', 'if (on) { a.init(); b.init() }'],
  ])('%s using bindings of two split options', async (_, statements) => {
    const options = 'loader: () => b.y, component: () => a.x'
    const keys = ['loader', 'component']
    const r = await report(
      route(`const a = make()\nconst b = make()\n${statements}`, options),
      keys,
    )
    expect(r.diagnostics).toEqual([])
    for (const line of statements.split('\n')) {
      expect(r.env).not.toContain(line)
    }
  })

  // code that runs later changing it keeps a statement (V): f08, c15
  it('code that runs later changing it too', async () => {
    const statement = "setTimeout(() => { cfg.dsn = 'y' }, 0)"
    const later = 'queueMicrotask(() => { cfg.ready = true })'
    const options = 'component: () => cfg.dsn'
    const code = route(
      `const cfg = { dsn: 'x' }\n${statement}\n${later}`,
      options,
    )
    const r = await report(code)
    written(
      r,
      code,
      'cfg',
      statement,
      `code that runs later changes it too (line ${lineOf(code, later)})`,
    )
    expect(r.diagnostics[0]!.message).toContain(
      'move `cfg` and the statements using it when the module loads to their own module',
    )
    const f = await report(
      route("import { cfg } from './own'", options),
      undefined,
      {
        '/app/own.ts': `export const cfg = { dsn: 'x' }\n${statement}\n${later}\n`,
      },
    )
    expect(f.diagnostics).toEqual([])
    expect(f.env).not.toContain('own')
  })

  // the move takes what the binding reads when the module loads: left in
  // the route module, the new module (which the route module imports to
  // re-export the export) would import it back, a cycle
  it('code that runs later changing an export reading another binding when the module loads', async () => {
    const statement = "Sentry.setContext('flags', flags)"
    const options = 'component: () => { flags.base = 1; return flags }'
    const code = route(
      `const prefix = { p: 'x' }\nexport const flags = { beta: false, p: prefix.p }\n${statement}`,
      options,
    )
    const r = await report(code, undefined, {}, true)
    written(r, code, 'flags', statement, 'code that runs later changes it too')
    expect(r.diagnostics[0]!.message).toContain(
      '; move `flags`, `prefix` and the statements using them when the module loads to their own module, so `flags` can load',
    )
    const f = await report(
      route("import { flags } from './flags'\nexport { flags }", options),
      undefined,
      {
        '/app/flags.ts': `import * as Sentry from '@sentry/react'\nconst prefix = { p: 'x' }\nexport const flags = { beta: false, p: prefix.p }\n${statement}\n`,
      },
      true,
    )
    expect(f.diagnostics).toEqual([])
  })

  // an import a statement changes is no declaration of the module: the
  // statement stays, the chunk imports the import itself, nothing reported
  it('reports nothing for an import a statement changes', async () => {
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
    expect(r.diagnostics).toEqual([])
  })

  it('a binding the route module keeps it also changes', async () => {
    const statement = 'if (on) { d.init(); k.init() }'
    const options = 'loader: () => k, component: () => d'
    const code = route(
      `const k = make()\nconst d = make()\n${statement}`,
      options,
    )
    written(
      await report(code),
      code,
      'd',
      statement,
      '`k`, which the route module keeps',
    )
    // the fix: `k` changed in a statement of its own
    const fixed = route(
      'const k = make()\nconst d = make()\nif (on) { d.init() }\nif (on) { k.init() }',
      options,
    )
    const f = await report(fixed)
    expect(f.diagnostics).toEqual([])
    expect(f.chunks.component).toContain(
      'const d = make()\nif (on) { d.init() }',
    )
  })

  // a statement writing two bindings when the module loads joins them: the
  // one only split code uses stays with the one the route module keeps
  // (recheck finding 4: m03, m16, m17)
  it.each([
    [
      'an if statement',
      'if (on) { a.v = 1; k.v = 2 }',
      'if (on) { a.v = 1 }\nif (on) { k.v = 2 }',
    ],
    ['a block', '{ a.v = 1; k.v = 2 }', '{ a.v = 1 }\n{ k.v = 2 }'],
    ['a sequence', 'a.v = 1, k.v = 2', 'a.v = 1\nk.v = 2'],
  ])(
    'a binding the route module keeps %s also writes',
    async (_, statement, apart) => {
      const options = 'loader: () => k, component: () => a'
      const code = route(
        `const a = make()\nconst k = make()\n${statement}`,
        options,
      )
      written(
        await report(code),
        code,
        'a',
        statement,
        'it also changes `k`, which the route module keeps; change `k` in a statement of its own',
      )
      // the fix
      const f = await report(
        route(`const a = make()\nconst k = make()\n${apart}`, options),
      )
      expect(f.diagnostics).toEqual([])
      expect(f.chunks.component).toContain('const a = make()')
    },
  )

  // the same for an exported binding (it was not reported: the pass
  // skipped exported clusters)
  it('a binding the route module keeps a statement also writes, the other one exported', async () => {
    const statement = 'if (on) { a.v = 1; k.v = 2 }'
    const options = 'loader: () => k, component: () => a'
    const code = route(
      `export const a = make()\nconst k = make()\n${statement}`,
      options,
    )
    written(
      await report(code, undefined, {}, true),
      code,
      'a',
      statement,
      'it also changes `k`, which the route module keeps; change `k` in a statement of its own',
    )
    // the fix
    const f = await report(
      route(
        'export const a = make()\nconst k = make()\nif (on) { a.v = 1 }\nif (on) { k.v = 2 }',
        options,
      ),
      undefined,
      {},
      true,
    )
    expect(f.diagnostics).toEqual([])
    expect(f.env).not.toContain('const a = make()')
  })

  // one expression writing both: the loader reads `k`, so no move is
  // offered, as for a call changing both
  it('a binding the route module keeps one expression also writes', async () => {
    const statement = 'a.v = k.v = 1'
    const options = 'loader: () => k, component: () => a'
    const code = route(
      `const a = make()\nconst k = make()\n${statement}`,
      options,
    )
    written(
      await report(code),
      code,
      'a',
      statement,
      `which changes it, stays there: it also changes \`k\`${seenBy(code, 'loader')}`,
    )
  })

  // the statement's own callback changes a binding another declaration
  // reads when the module loads: that reader is what keeps it (recheck
  // finding 5: m04, s12)
  it('a binding its own callback changes later, which a declaration reads at load', async () => {
    const statement = 'setTimeout(() => { a.v = b.v + 10 }, 0)'
    const options = 'loader: () => b, component: () => seen'
    const keys = ['loader', 'component']
    const code = route(
      `const a = make()\nconst b = make()\n${statement}\nconst seen = [a.v]`,
      options,
    )
    const r = await report(code, keys)
    const byName = r.diagnostics.filter((d) =>
      d.message.includes('`b` in /app/route.tsx'),
    )
    expect(byName).toMatchObject([
      { code: 'eager-split:written', range: { start: code.indexOf('b = ') } },
    ])
    expect(byName[0]!.message).toContain(
      `the statement on line ${lineOf(code, statement)}, which uses it, stays there: it changes \`a\` later, which \`seen\` uses when the module loads; use \`a\` inside the code that needs \`seen\` instead of when the module loads`,
    )
    // the fix
    const f = await report(
      route(
        `const a = make()\nconst b = make()\n${statement}`,
        'loader: () => b, component: () => [a.v]',
      ),
      keys,
    )
    expect(f.diagnostics).toEqual([])
    expect(f.env).not.toContain('const b')
  })

  // an export: the statement naming the binding the route module keeps,
  // not one reaching it through the export (recheck finding 3: x02)
  it('names the statement that uses the kept binding for an export', async () => {
    const statement = 'flags.base = base'
    const code = route(
      `const base = make()\nexport const flags = { beta: false }\n${statement}\nSentry.setContext('flags', flags)`,
      'beforeLoad: () => base, component: () => flags',
    )
    written(
      await report(code, undefined, {}, true),
      code,
      'flags',
      statement,
      'which changes it, stays there: it also uses `base`, which the route module keeps; run that statement in the code that needs it',
    )
    // the fix makes the component a later writer of what `Sentry.setContext`
    // uses at load: the next warning says so, and asks to move only what
    // runs at load (recheck finding 6)
    const fixed = route(
      `const base = make()\nexport const flags = { beta: false }\nSentry.setContext('flags', flags)`,
      'beforeLoad: () => base, component: () => { flags.base = base; return flags }',
    )
    const f = await report(fixed, undefined, {}, true)
    written(
      f,
      fixed,
      'flags',
      "Sentry.setContext('flags', flags)",
      'move `flags` and the statements using it when the module loads to their own module',
    )
    // that fix, applied: the route module re-exports `flags` from its own
    // module, and nothing is reported
    const own = await report(
      route(
        "import { flags } from './flags'\nconst base = make()\nexport { flags }",
        'beforeLoad: () => base, component: () => { flags.base = base; return flags }',
      ),
      undefined,
      {
        '/app/flags.ts': `import * as Sentry from '@sentry/react'\nexport const flags = { beta: false }\nSentry.setContext('flags', flags)\n`,
      },
      true,
    )
    expect(own.diagnostics).toEqual([])
    expect(own.chunks.component).toContain('flags.base = base')
  })

  // (the statement itself when only a function it calls names the binding,
  // x04; not a statement of the binding's own cluster, which need not use
  // the subject, x14)
  it.each([
    [
      'a function the statement calls',
      'const base = make()\nfunction getBase() { return base }\nexport const flags = { beta: false }\nmake(() => { flags.base = getBase() })',
      'make(() => { flags.base = getBase() })',
      'beforeLoad: () => base, component: () => flags',
      ['component'],
      'flags',
      'it also uses `base`, which the route module keeps',
    ],
    [
      "the binding's own statements",
      "export class Store { static items = [] }\nStore.items.push(make())\nexport const store = new Store()\nSentry.setContext('store', store)",
      "Sentry.setContext('store', store)",
      'component: () => [Store.items, store], loader: () => Store.items',
      ['component', 'loader'],
      'store',
      'it also uses `Store`',
    ],
  ])(
    'names the statement that stays for an export, past %s',
    async (_, decls, statement, options, keys, name, cause) => {
      const code = route(decls, options)
      written(await report(code, keys, {}, true), code, name, statement, cause)
    },
  )

  // a later writer in another split option: the fix moves what uses the
  // binding when the module loads, not a line of that option (recheck
  // finding 6)
  it('code another split option runs later changing it too', async () => {
    const statement = 'register(cache)'
    const options =
      "loader: () => { cache.set('a', 1) }, component: () => cache.get('a')"
    const keys = ['loader', 'component']
    const code = route(
      `const cache = new Map()\n${statement}`,
      options,
    ).replace(
      "import { make } from './lib'",
      "import { register } from './lib'",
    )
    written(
      await report(code, keys),
      code,
      'cache',
      statement,
      `code that runs later changes it too (line ${lineOf(code, "cache.set('a', 1)")}); move \`cache\` and the statements using it when the module loads to their own module`,
    )
    const f = await report(
      route("import { cache } from './own'", options),
      keys,
      {
        '/app/own.ts': `import { register } from './lib'\nexport const cache = new Map()\n${statement}\n`,
      },
    )
    expect(f.diagnostics).toEqual([])
  })

  // (the spelling variants: a hoisted component the route's value holds
  // moves, so a staying statement handing the route to an import reports
  // nothing)
  it('reports nothing that moves, for a statement that stays', async () => {
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
    expect(r.diagnostics).toEqual([])
  })

  // several split options using what it changes: their shared module
  // (R151), nothing reported
  it('several split options using what it changes', async () => {
    const statement = 'd.add(1)'
    const options = 'component: () => d, errorComponent: () => d'
    const keys = ['component', 'errorComponent']
    const r = await report(
      route(`const d = make()\n${statement}`, options),
      keys,
    )
    expect(r.diagnostics).toEqual([])
    expect(r.env).not.toContain(statement)
  })
})

// Rule L reads objects through language operations: a write of the object
// through another name after the read is one of that object, ordered
// against the read (the mutation model's owner of "the object a binding
// names").
describe('rule L: an object written through another name', () => {
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

// A name inside an expression that hands its value on (a conditional's
// branch, `??`/`||`/`&&`, a sequence's last, `await`, an assignment's
// value, a literal read back) reads the object it holds where that value is
// read, as `alias.b` does. The loader keeps `cfg` and its write in the route
// module, so the read stays there, before the write (Fable's review of
// order rule v2, finding 1: `cases/wrap.json`).
describe('rule L: a read through an alias inside a forwarding expression', () => {
  const run = (decls: string) =>
    split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { makeCfg } from './lib'
        const on = true
        const cfg = makeCfg()
        ${decls.split('\n').join('\n        ')}
        cfg.b = 2
        export const Route = createFileRoute('/x')({
          loader: () => cfg,
          component: () => got,
        })
      `),
    )
  const beforeWrite = (r: Awaited<ReturnType<typeof split>>, read: string) => {
    expect(r.chunks.component).not.toContain(read)
    expect(r.env).toContain(read)
    expect(r.env.indexOf('cfg.b = 2')).toBeGreaterThan(r.env.indexOf(read))
  }

  it.each([
    ['a conditional', 'const got = (on ? alias : {}).b'],
    [
      'a conditional in an optional chain',
      'const got = (on ? alias : null)?.b',
    ],
    [
      'a nested conditional',
      'const got = (on ? (on ? alias : null) : null)?.b',
    ],
    ['`??`', 'const got = (alias ?? {}).b'],
    ['`||`', 'const got = (alias || {}).b'],
    ['`&&`', 'const got = (on && alias).b'],
    ['a sequence', 'const got = (0, alias).b'],
    ['`await`', 'const got = (await alias).b'],
    ['an assignment', 'let tmp\nconst got = (tmp = alias).b'],
    ['an array literal read back', 'const got = [alias][0].b'],
    ['an object literal read back', 'const got = ({ a: alias }).a.b'],
    [
      'an object literal in a conditional read back',
      'const got = (on ? { x: alias } : null)?.x.b',
    ],
    ['a template around one', 'const got = `${(on ? alias : {}).b}`'],
    ['a spread of a conditional', 'const got = { ...(on ? alias : {}) }'],
    ['`in` on a conditional', "const got = 'b' in (on ? alias : {})"],
    ['a destructuring of a conditional', 'const { b: got } = on ? alias : {}'],
  ])('through %s', async (_, read) => {
    const r = await run(`const alias = cfg\n${read}`)
    beforeWrite(r, read.split('\n').at(-1)!)
  })

  it.each([
    ['a `let` alias', 'let alias = cfg'],
    [
      'a destructured alias',
      'const holder = { cfg }\nconst { cfg: alias } = holder',
    ],
  ])('through %s in a conditional', async (_, alias) => {
    const read = 'const got = (alias ?? {}).b'
    const r = await run(`${alias}\n${read}`)
    beforeWrite(r, read)
  })

  // the same climb finds the object a member write writes
  it('orders a read before a write through an alias in a conditional', async () => {
    const r = await split(
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { makeCfg } from './lib'
        const on = true
        const cfg = makeCfg()
        const alias = cfg
        const got = cfg.b
        ;(on ? alias : {}).b = 2
        export const Route = createFileRoute('/x')({
          loader: () => cfg,
          component: () => got,
        })
      `),
    )
    expect(r.env).toContain('const got = cfg.b')
    expect(r.env.indexOf('(on ? alias : {}).b = 2')).toBeGreaterThan(
      r.env.indexOf('const got = cfg.b'),
    )
  })
})

describe('generated imports', () => {
  // A planner's runtime helper (Start's server-fn stubs `createClientRpc`,
  // `createSsrRpc`) is an import like one the source wrote: every output
  // reading it imports it itself, never through the env module (an
  // extracted module evaluates before the env module's body: the verifier's
  // rule (e)), and one nothing reads is dropped.
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
              provenance: { origin: 'runtime' },
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
    opts: { keys?: Array<string>; type?: 'client' | 'server' } = {},
  ) {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toySplitPlanner({
        keys: opts.keys ?? ['component'],
        extractExports: true,
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

  it.each(['client', 'server'] as const)(
    'are imported by each extracted module reading them at load (%s)',
    async (type) => {
      const code = dedent(`
        import { createFileRoute } from 'toy-router'
        export const a = [1]
        export const b = [2]
        export const Route = createFileRoute('/')({ component: () => a[0] + b[0] })
      `)
      const ids = ['?tsr-split=export---a', '?tsr-split=export---b']
      const out = await compileAll(code, ['[1]', '[2]'], ids, { type })
      expect(out['']).not.toContain('tsrStub')
      for (const id of ids) {
        expect(out[id], id).toContain(imported)
        expect(out[id], id).not.toContain("from '/app/route.tsx'")
      }
    },
  )

  it('are imported by the env module and an extracted module both reading them', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      const kept = [0]
      export const a = [1]
      export const Route = createFileRoute('/')({
        loader: () => kept,
        component: () => a[0],
      })
    `)
    const id = '?tsr-split=export---a'
    const out = await compileAll(code, ['[0]', '[1]'], [id])
    expect(out['']).toContain(imported)
    expect(out['']).toContain('const kept = tsrStub([0])')
    expect(out[id]).toContain(imported)
    expect(out[id]).not.toContain("from '/app/route.tsx'")
  })

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
    const out = await compileAll(code, ['[3]'], [id])
    expect(out[id]).toContain('function make() { return tsrStub([3]) }')
    expect(out[id]).toContain(imported)
    expect(out[id]).not.toContain('export---make')
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

// A compile's builder chains (`RecognizerTable.builderLinks`) with pure
// arguments are no effect for the planners, in either environment: what the
// environment erases (on the client a server fn's validator and handler)
// does not count, what it keeps does. A link on a `const` holding a builder
// stays an effect (a middleware's links write that builder's options).
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
    // a middleware's links assign the options of the builder they are
    // called on; a server fn's copy them into a new one
    builderLinksWrite: new Set(['middleware']),
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
      kept: (main?.diagnostics ?? [])
        .filter((d) => d.code?.startsWith('eager-'))
        .map((d) => /`(\w+)` in \//.exec(d.message)![1]!),
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
      expect(r.kept, type).toEqual([])
    }
  })

  // two split options alone: one shared module, the effect included
  // (R151); which argument is an effect in which environment is a target
  // fact (facts.test, "builder chains per environment")
  it('puts a chain two split options read in their shared module, in both environments', async () => {
    const code = route(
      'const fn = createServerFn().middleware([track()]).handler(async () => 1)',
    )
    for (const type of ['client', 'server'] as const) {
      const r = await compile(code, type)
      expect(r.env, type).not.toContain('const fn =')
      expect(r.kept, type).toEqual([])
    }
  })

  // A link on a builder held in a `const` writes the builder (a
  // middleware's links assign its options): a write with pure operands,
  // ordered against what reads the builder, not an opaque effect (R139).
  // The builder and its link are one cluster, which moves as the inline
  // chain does.
  it('moves a page-only chain on a const builder into the chunk in both environments', async () => {
    const code = route(
      'const base = createServerFn()\nconst fn = base.handler(async () => 1)',
    )
    for (const type of ['client', 'server'] as const) {
      const r = await compile(code, type)
      expect(r.env, type).not.toContain('createServerFn()')
      expect(r.kept, type).toEqual([])
    }
  })

  // REVIEW-design2-step4 finding 4: whether a link writes its builder is a
  // fact of the builder's kind. A server fn's links copy the options, so
  // two server fns on one shared base are independent readers of it; a
  // middleware's write it, so its links and the base are one cluster.
  it('moves a page-only server fn on a shared const base, the other one staying', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createServerFn } from 'toy-start'
      const base = createServerFn().middleware([])
      const getA = base.handler(async () => 1)
      const getB = base.handler(async () => 2)
      export const Route = createFileRoute('/')({
        loader: () => getB,
        component: () => getA,
      })
    `)
    const host = new MemoryHost({
      files: { '/app/route.tsx': code },
      recognizer,
    })
    const planners = [toySplitPlanner({ keys: ['component'] })]
    const env = envInfo({ mode: 'build', type: 'client', name: 'client' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    const chunk = await host.compile(
      '/app/route.tsx?tsr-split=component',
      planners,
      { env },
    )
    expect(main?.code).toContain('const base = createServerFn()')
    expect(main?.code).toContain('const getB = base.handler(')
    expect(main?.code).not.toContain('const getA')
    expect(chunk?.code).toContain('const getA = base.handler(')
    expect(chunk?.code).toContain("import { base } from '/app/route.tsx'")
    expect(main?.diagnostics).toEqual([])
  })

  it('keeps the links of a middleware on a shared const base with it', async () => {
    const code = dedent(`
      import { createFileRoute } from 'toy-router'
      import { createMiddleware } from 'toy-start'
      const base = createMiddleware().middleware([])
      const forPage = base.server(async () => 1)
      const forLoader = base.server(async () => 2)
      export const Route = createFileRoute('/')({
        loader: () => forLoader,
        component: () => forPage,
      })
    `)
    const host = new MemoryHost({
      files: { '/app/route.tsx': code },
      recognizer,
    })
    const planners = [toySplitPlanner({ keys: ['component'] })]
    const env = envInfo({ mode: 'build', type: 'client', name: 'client' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    expect(main?.code).toContain(
      'const base = createMiddleware().middleware([])\nconst forPage = base.server(',
    )
  })

  // Two links on one middleware builder: each writes it, so the builder
  // and both exports are one cluster and leave together, to the first
  // one's module. (Finding 4: a server fn's links write nothing, so this
  // row moved to the middleware kind; the server fn spelling follows.)
  it('extracts two exports linked on one const builder together', async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { createMiddleware } from 'toy-start'
          const base = createMiddleware()
          export const one = base.server(async () => 1)
          export const two = base.server(async () => 2)
          export const Route = createFileRoute('/')({
            component: () => [one, two],
          })
        `),
      },
      recognizer,
    })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = envInfo({ mode: 'build', type: 'client', name: 'client' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    expect(main?.code).not.toContain('createMiddleware()')
    expect(main?.code).toContain(
      "export { one, two } from '/app/route.tsx?tsr-split=export---one'",
    )
    const extracted = await host.compile(
      '/app/route.tsx?tsr-split=export---one',
      planners,
      { env },
    )
    expect(extracted?.code).toContain(
      'const base = createMiddleware()\nconst one = base.server(',
    )
    expect(main?.diagnostics).toEqual([])
  })

  // REVIEW-design2-final finding 3: a middleware's link writes its builder
  // wherever it stands, not only where the purity check meets it: in a
  // function (a write at an unknown time, V) and in a split option value
  // (the value's own write at load).
  describe('a link on a const middleware builder outside a statement', () => {
    const linked = (decls: string, options: string) =>
      dedent(`
        import { createFileRoute } from 'toy-router'
        import { createMiddleware } from 'toy-start'
        import { auth } from './auth'
        const mw = createMiddleware()
        ${decls.split('\n').join('\n        ')}
        export const Route = createFileRoute('/')({
          ${options.split('\n').join('\n          ')}
        })
      `)
    async function compileKeys(
      code: string,
      keys: Array<string>,
      type: 'client' | 'server' = 'client',
    ) {
      const host = new MemoryHost({
        files: { '/app/route.tsx': code },
        recognizer,
      })
      const planners = [toySplitPlanner({ keys })]
      const env = envInfo({
        mode: 'build',
        type,
        name: type === 'client' ? 'client' : 'ssr',
      })
      return host.compile('/app/route.tsx', planners, { env })
    }

    it('keeps a reader of the builder a function links on in the route module', async () => {
      const main = await compileKeys(
        linked(
          'const before = { ...mw.options }\nfunction setup() { mw.middleware([auth]) }',
          'beforeLoad: () => setup(),\ncomponent: () => before,',
        ),
        ['component'],
      )
      expect(main?.code).toContain('const before = { ...mw.options }')
      expect(main?.diagnostics.map((d) => d.code)).toContain(
        'eager-split:state',
      )
    })

    it('keeps an option value linking on a builder another chunk reads in place', async () => {
      const main = await compileKeys(
        linked(
          'const before = { ...mw.options }',
          'loader: () => before,\ncomponent: (mw.middleware([auth]), () => null),',
        ),
        ['loader', 'component'],
      )
      expect(main?.code).toContain('component: (mw.middleware([auth])')
      expect(main?.facts.planners['toy-split']).toMatchObject({
        notSplittable: 'component',
        reasons: { component: 'ordered-effect' },
      })
    })

    // Source: REVIEW-design2-final, case B1 (the executing property's
    // minimal input)
    it('keeps two option values linking on a builder the route module reads in place', async () => {
      const main = await compileKeys(
        linked(
          '',
          'loader: (mw.server(() => 9), () => null),\ncomponent: (mw.server(() => 10), () => null),\nerrorComponent: () => mw,',
        ),
        ['loader', 'component'],
        'server',
      )
      expect(main?.code).toContain('loader: (mw.server(() => 9)')
      expect(main?.code).toContain('component: (mw.server(() => 10)')
      expect(main?.facts.planners['toy-split']).toMatchObject({
        reasons: { loader: 'ordered-effect', component: 'ordered-effect' },
      })
    })
  })

  // Two exported server fns on one shared base read it, each from its own
  // extracted module: the base, a call result, exists once (R77), so the
  // route module keeps it and both, which read it when they load (T).
  it('keeps two exported server fns on one shared const base in the route module', async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { createServerFn } from 'toy-start'
          const base = createServerFn()
          export const one = base.handler(async () => 1)
          export const two = base.handler(async () => 2)
          export const Route = createFileRoute('/')({
            component: () => [one, two],
          })
        `),
      },
      recognizer,
    })
    const planners = [
      toySplitPlanner({ keys: ['component'], extractExports: true }),
    ]
    const env = envInfo({ mode: 'build', type: 'client', name: 'client' })
    const main = await host.compile('/app/route.tsx', planners, { env })
    expect(main?.code).toContain(
      'const base = createServerFn()\nexport const one = base.handler(',
    )
    expect(main?.diagnostics.map((d) => d.code)).toEqual([
      'eager-export:reads',
      'eager-export:reads',
    ])
  })

  // A builder in a `const` and its one link is the inline chain spelled in
  // two statements (spelling variants §7), compiled alike (R139).
  it('compiles an exported server fn built on a const builder as the inline chain', async () => {
    const outputs = async (declarations: string, type: 'client' | 'server') => {
      const host = new MemoryHost({
        files: { '/app/route.tsx': route(declarations) },
        recognizer,
      })
      const planners = [
        toySplitPlanner({ keys: ['component'], extractExports: true }),
      ]
      const env = envInfo({ mode: 'build', type, name: type })
      const out: Array<string> = []
      for (const id of [
        '/app/route.tsx',
        '/app/route.tsx?tsr-split=component',
        '/app/route.tsx?tsr-split=export---fn',
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
  it('stays an effect: what the rest of it reads stays with it', async () => {
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
    // (R149: the call uses no binding that moves, so it stays)
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
              provenance: { origin: 'runtime' },
            },
          },
        ],
      })
    },
  })

  const compile = async (code: string, planner: Planner) => {
    const host = new MemoryHost({ files: { '/app/route.tsx': code } })
    const planners = [
      toyEnvPlanner(),
      toySplitPlanner({ keys: ['component', 'pendingComponent'] }),
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

/**
 * What the evaluation of some module-level bindings may read, by name: a
 * reference written apart from the compiler. The names their declarations
 * and the top-level statements writing them evaluate (a function nested
 * in them only when it is passed to a call or called in place) and, once
 * that text calls anything, every name in the module's declarations of
 * those names and in the top-level statements writing them, transitively.
 */
function evaluatedNames(
  code: string,
  subjects: ReadonlySet<string>,
): Set<string> | null {
  const parsed = parseModule(code, { lang: 'tsx', sourceType: 'module' })
  if (!parsed.ok) {
    return null
  }
  const declarations = new Map<string, Node>()
  const writers = new Map<string, Array<Node>>()
  const evaluated: Array<Node> = []
  for (const statement of parsed.file.program.body) {
    const d =
      statement.type === 'ExportNamedDeclaration' && statement.declaration
        ? statement.declaration
        : statement
    if (
      (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') &&
      d.id
    ) {
      declarations.set(d.id.name, d)
    } else if (d.type === 'VariableDeclaration') {
      for (const declarator of d.declarations) {
        // (each name a pattern binds: `const { cfg: alias } = holder`)
        const bind = (p: Node): void => {
          if (p.type === 'Identifier') {
            declarations.set(p.name, declarator)
          } else if (p.type === 'ObjectPattern') {
            p.properties.forEach((q) =>
              bind(q.type === 'Property' ? q.value : q),
            )
          } else if (p.type === 'ArrayPattern') {
            p.elements.forEach((e) => e && bind(e))
          } else if (p.type === 'RestElement') {
            bind(p.argument)
          } else if (p.type === 'AssignmentPattern') {
            bind(p.left)
          }
        }
        bind(declarator.id)
      }
    } else {
      // a statement writing a binding (`x = …`, `x.p = …`) is part of its
      // value: it evaluates with a subject, and with a name a call reaches
      walk(d, {
        enter: (n) => {
          // (and a mutating method's receiver: `a.push(b)`)
          let target =
            n.type === 'AssignmentExpression'
              ? n.left
              : n.type === 'UpdateExpression'
                ? n.argument
                : n.type === 'CallExpression' &&
                    n.callee.type === 'MemberExpression' &&
                    n.callee.property.type === 'Identifier' &&
                    /^(push|unshift|splice|set|add|delete|clear)$/.test(
                      n.callee.property.name,
                    )
                  ? n.callee.object
                  : null
          while (target?.type === 'MemberExpression') {
            target = target.object
          }
          if (target?.type === 'Identifier') {
            const list = writers.get(target.name) ?? []
            if (!list.includes(d)) {
              list.push(d)
            }
            writers.set(target.name, list)
          }
        },
      })
    }
  }
  for (const name of subjects) {
    const d = declarations.get(name)
    if (d === undefined) {
      return null
    }
    evaluated.push(d, ...(writers.get(name) ?? []))
  }
  const names = new Set<string>()
  let calls = false as boolean
  const collect = (node: Node, whole: boolean) => {
    const passed = new Set<Node>()
    walk(node, {
      enter: (n, w) => {
        switch (n.type) {
          case 'CallExpression':
          case 'NewExpression':
            calls = true
            // (called in place: the callee, or the function of its
            // `.call`/`.apply`/`.bind`)
            for (const a of [n.callee, ...n.arguments]) {
              const v = unwrapExpression(a)
              passed.add(
                v.type === 'MemberExpression' ? unwrapExpression(v.object) : v,
              )
            }
            return
          case 'TaggedTemplateExpression':
            calls = true
            return
          case 'FunctionExpression':
          case 'ArrowFunctionExpression':
          case 'FunctionDeclaration':
            if (!whole && n !== node && !passed.has(n)) {
              w.skip()
            }
            return
          case 'Identifier':
            names.add(n.name)
        }
      },
    })
  }
  for (const node of evaluated) {
    collect(node, false)
  }
  if (calls) {
    // (a subject's own function may be what a call reaches: `const read =
    // () => n; const initial = wrap(read)`, reported together)
    const seen = new Set<Node>()
    for (let grew = true; grew; ) {
      grew = false
      for (const name of [...names]) {
        for (const d of [
          declarations.get(name),
          ...(writers.get(name) ?? []),
        ]) {
          if (d !== undefined && !seen.has(d)) {
            seen.add(d)
            collect(d, true)
            grew = true
          }
        }
      }
    }
  } else {
    // without a call, a read through a name (`alias.v`, `{ ...alias }`)
    // reads what that name's value holds: its declaration and writers,
    // outside functions, transitively
    const seen = new Set<Node>(evaluated)
    for (let grew = true; grew; ) {
      grew = false
      for (const name of [...names]) {
        for (const d of [
          declarations.get(name),
          ...(writers.get(name) ?? []),
        ]) {
          if (d !== undefined && !seen.has(d)) {
            seen.add(d)
            collect(d, false)
            grew = true
          }
        }
      }
    }
  }
  return names
}

// R152: a call holds (does not run when the module loads) the functions
// it is handed when its result is called later by the router: a route
// option's value the planner states, split or not, directly, through
// `const`s, or handed on to such a call (wrappers of wrappers). Every other
// call, and the extraction check, read as before. A name inside an object or
// array handed to a call is held (small item 2c).
describe('calls whose result the router calls later (R152)', () => {
  const route = (decls: string, options: string, extra = '') =>
    dedent(`
      import { createFileRoute } from 'toy-router'
      import { hoc, run, f } from './lib'
      ${decls.split('\n').join('\n      ')}
      export const Route = createFileRoute('/')({
        ${options.split('\n').join('\n        ')}
      })
      ${extra}
    `)
  const lib = {
    '/app/lib.ts':
      'export const hoc = <T,>(x: T) => x\nexport const run = <T,>(g: () => T) => g()\nexport const f = (x: unknown) => x\n',
  }
  const notSplit = (r: Awaited<ReturnType<typeof split>>) =>
    (
      r.main?.facts.planners['toy-split'] as
        | { notSplittable?: string }
        | undefined
    )?.notSplittable
  const seen = 'const seen = new Set<number>()'
  const loader = 'loader: () => { seen.add(1) },'

  it.each([
    ['inline', '', 'component: hoc(function Page() { return seen.size }),'],
    ['named', 'function Page() { return seen.size }', 'component: hoc(Page),'],
    [
      'in wrappers of wrappers',
      '',
      'component: hoc(hoc(function Page() { return seen.size })),',
    ],
    [
      'in a cast',
      '',
      'component: hoc(function Page() { return seen.size }) as any,',
    ],
    [
      'through a `const`',
      'function Page() { return seen.size }\nconst P = hoc(Page)',
      'component: P,',
    ],
    [
      'through a `const` of wrappers of wrappers',
      'function Page() { return seen.size }\nconst P = hoc(hoc(Page))',
      'component: P,',
    ],
    [
      'through a `const` handed to another',
      'function Page() { return seen.size }\nconst A = hoc(Page)\nconst P = hoc(A)',
      'component: P,',
    ],
    [
      'through a `const` naming another',
      'function Page() { return seen.size }\nconst A = hoc(Page)\nconst P = A',
      'component: P,',
    ],
  ])(
    'splits an option value whose call holds a function reading state the loader writes (%s)',
    async (_, decls, options) => {
      const r = await split(
        route(`${seen}\n${decls}`, `${loader}\n${options}`),
        {
          files: lib,
        },
      )
      expect(notSplit(r)).toBeUndefined()
      expect(r.chunks.component).toContain('return seen.size')
      expect(r.env).not.toContain('seen.size')
      expect(r.env).not.toContain('hoc(')
      expect(r.main?.diagnostics).toEqual([])
    },
  )

  // the accepted break (R152, R146's family): a factory that runs its
  // function at once reads the state when the chunk loads
  it('splits an option value whose call is handed a function reading a binding the loader writes, whatever the call does with it', async () => {
    const r = await split(
      route(
        'let base = 1',
        'loader: () => { base = 5 },\ncomponent: run(() => { const b = base; return () => b }),',
      ),
      { files: lib },
    )
    expect(notSplit(r)).toBeUndefined()
    expect(r.chunks.component).toContain('run(() => {')
  })

  // its result is called when the module loads: not a value the router
  // calls later, the call runs its function as before
  it('keeps a `const` whose call result is also called when the module loads', async () => {
    const r = await split(
      route(
        `${seen}\nfunction Page() { return seen.size }\nconst P = hoc(Page)\nconst first = P()`,
        `${loader}\ncomponent: P,`,
      ),
      { files: lib },
    )
    expect(r.env).toContain('const P = hoc(Page)')
    expect(r.chunks.component).not.toContain('hoc(Page)')
  })

  // a value the router calls later that the planner does not split: its
  // call holds the function, so the route reads nothing at load
  it('holds the function an unsplit option value hands to its call', async () => {
    const r = await split(
      route(
        'const seen = { n: 0 }\nconst C = f(function Page() { seen.n++; return null })',
        'loader: hoc(function load() { return seen.n }),\ncomponent: () => C,',
      ),
      { files: lib },
    )
    expect(r.env).not.toContain('const C =')
    expect(r.chunks.component).toContain('const C = f(function Page()')
    expect(r.main?.diagnostics).toEqual([])
  })

  // small item 2c, with R152: a name inside an object or array handed to
  // such a call is held, as an inline function there already is
  it.each([
    [
      'an object, inline (control)',
      'hoc({ render() { return seen.size } })',
      '',
    ],
    [
      'an object, by name',
      'hoc({ render })',
      'function render() { return seen.size }',
    ],
    [
      'an array, by name',
      'hoc([render])',
      'function render() { return seen.size }',
    ],
    [
      'a nested object',
      'hoc({ a: [{ render }] })',
      'function render() { return seen.size }',
    ],
  ])(
    'moves a `const` the router calls later whose call is handed a function inside %s',
    async (_, call, decls) => {
      const r = await split(
        route(
          `${seen}\n${decls}\nconst P = ${call}`,
          `${loader}\ncomponent: P,`,
        ),
        { files: lib },
      )
      expect(notSplit(r)).toBeUndefined()
      expect(r.env).not.toContain('const P =')
      expect(r.chunks.component).toContain(`const P = ${call}`)
      expect(r.main?.diagnostics).toEqual([])
    },
  )

  // the extraction check reads every call as running what it is handed:
  // an export whose call is handed a function reading what the route
  // module keeps stays there (`createIcon(() => cfg.path)` would read it
  // before it exists), so the option naming it is not split
  it('keeps an exported option value whose call is handed a function reading a binding the route module keeps', async () => {
    const code = route(
      'const cfg = { v: 1 }\nexport const W = hoc(function W() { return cfg.v })',
      'loader: () => cfg,\ncomponent: W,',
    )
    const r = await split(code, { files: lib, extractExports: true })
    expect(r.env).toContain('export const W = hoc(function W()')
    expect(r.chunks.component).not.toContain('cfg.v')
    expect(r.main?.facts.planners['toy-split']).toMatchObject({
      reasons: { component: 'env-declared' },
    })
  })

  // every other call reads as before: a function handed to it may run when
  // it does, which the message says. A wrapped component used only as a
  // JSX tag is one of them (R152 holds route option values only). The move
  // takes the function it hands along (the new module would import it
  // back)
  it.each([
    [
      'inline',
      '',
      'const save = f(() => seen.size)',
      'save',
      'f',
      '() => save',
      'both',
    ],
    [
      'named',
      'function compute() { return seen.size }\n',
      'const save = f(compute)',
      'save',
      'f',
      '() => save',
      '`save`, `seen` and `compute`',
    ],
    [
      'named inside an object',
      'function compute() { return seen.size }\n',
      'const save = f({ compute })',
      'save',
      'f',
      '() => save',
      '`save`, `seen` and `compute`',
    ],
    [
      'a wrapped component used as a JSX tag',
      '',
      'const Card = hoc(function Card() { return <p>{seen.size}</p> })',
      'Card',
      'hoc',
      'function Page() { return <Card /> }',
      'both',
    ],
  ])(
    'keeps a declaration handing a function reading written state to a call the router does not call later, saying it may use it (%s)',
    async (_, decls, decl, name, callee, component, moved) => {
      const code = route(
        `${seen}\n${decls}${decl}`,
        `${loader}\ncomponent: ${component},`,
      )
      const r = await split(code, { files: lib })
      expect(r.env).toContain(decl)
      const kept = (r.main?.diagnostics ?? []).filter((d) =>
        d.code?.startsWith('eager-'),
      )
      expect(kept).toMatchObject([
        {
          code: 'eager-split:state',
          range: { start: code.indexOf(`${name} = `) },
        },
      ])
      expect(kept[0]!.message).toBe(
        `[tanstack-router] \`${name}\` in /app/route.tsx stays in the route module because it may use \`seen\` when the module loads (the function is handed to \`${callee}\`), and the module writes \`seen\`; move ${moved} to their own module, so \`${name}\` can load with the split \`component\`.`,
      )
    },
  )
})

// P4: a kept declaration's message names a binding its evaluation reads,
// for every `state` record this file's compiles report (F1-5b:
// a holder of a function another declaration calls was said to use what
// that function reads)
describe('the binding a kept declaration is reported reading', () => {
  it('is one its evaluation reads, in every report of this file', () => {
    const wrong: Array<string> = []
    let checked = 0
    for (const { code, out } of compileLog.entries) {
      for (const d of out?.diagnostics ?? []) {
        if (d.code !== 'eager-split:state') {
          continue
        }
        const read = /(?:uses?|reads?) `([^`]+)` when the module loads/.exec(
          d.message,
        )?.[1]
        // the kept bindings: the names before the file
        const subjects = new Set(
          [...d.message.split(' in /')[0]!.matchAll(/`([^`]+)`/g)].map(
            (m) => m[1]!,
          ),
        )
        const names = evaluatedNames(code, subjects)
        if (read === undefined || names === null) {
          continue
        }
        checked++
        if (!names.has(read)) {
          wrong.push(`${d.message}\n${code}`)
        }
      }
    }
    expect(checked).toBeGreaterThan(10)
    expect(wrong).toEqual([])
  })
})
