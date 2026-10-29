import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  envInfo,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'
import type { EdgeRecord, Lang, Planner, PolicyContext } from '../src/compiler'

/** A tier-0 policy planner that records every output's edges and its policy context. */
function edgeRecorder(
  onPolicy?: (edges: Array<EdgeRecord>, ctx: PolicyContext) => void,
): Planner & { edges: Record<string, Array<EdgeRecord>> } {
  const edges: Record<string, Array<EdgeRecord>> = {}
  return {
    name: 'edge-recorder',
    tier: 0,
    edges,
    gate: (t0) => t0.hasImportOrExport || t0.dynamicEdges.length > 0,
    plan() {},
    policy(_plan, output, outputEdges, ctx) {
      edges[output] = outputEdges.map((e) => ({ ...e }))
      onPolicy?.(outputEdges, ctx)
      return Promise.resolve()
    },
  }
}

const byspec = (edges: Array<EdgeRecord>) =>
  Object.fromEntries(
    edges.map((e) => [`${e.form} ${e.specifier}`, [e.kind, e.names]]),
  )

describe('edge names (J6)', () => {
  const source = dedent(`
    import { used, typeOnlyUse, unused } from './a'
    import * as ns from './b'
    import * as opaque from './c'
    import def from './d'
    import { reexported } from './e'
    import type { T } from './f'
    import './g'
    export { reexported }
    export const run = (x: typeOnlyUse) => used() + ns.one + ns['two'] + <ns.Three /> + def
    export const leak = opaque
    export type U = T
  `)

  it('J6-only tier: names are the specifiers used as values; namespaces list their member reads', async () => {
    const host = new MemoryHost({ files: { '/app/m.tsx': source } })
    const rec = edgeRecorder()
    await host.compile('/app/m.tsx', [rec])
    expect(byspec(rec.edges.env!)).toEqual({
      'static ./a': ['binding', ['used']],
      'static ./b': ['binding', ['one', 'two', 'Three']],
      'static ./c': ['binding', ['*']],
      'static ./d': ['binding', ['default']],
      'static ./e': ['binding', ['reexported']],
      'bare ./g': ['evaluation', []],
    })
  })

  it('an import used only in types or not at all is an evaluation edge', async () => {
    const host = new MemoryHost({
      files: {
        '/app/m.ts': dedent(`
          import { A } from './types'
          import { B } from './unused'
          export const f = (a: A) => a
        `),
      },
    })
    const rec = edgeRecorder()
    await host.compile('/app/m.ts', [rec])
    expect(byspec(rec.edges.env!)).toEqual({
      'static ./types': ['evaluation', []],
      'static ./unused': ['evaluation', []],
    })
  })

  it('tier 1: names ignore uses inside erased ranges and keep `export { x }`', async () => {
    const host = new MemoryHost({
      files: {
        '/app/m.ts': dedent(`
          import { wrapServer } from 'toy-start'
          import * as ns from './secret.server'
          import { kept } from './kept'
          export { kept }
          export const fn = wrapServer(() => ns.handlerOnly())
          export const read = () => ns.everywhere
        `),
      },
    })
    const rec = edgeRecorder()
    await host.compile('/app/m.ts', [toyEnvPlanner(), rec])
    const edges = byspec(rec.edges.env!)
    expect(edges['static ./secret.server']).toEqual(['binding', ['everywhere']])
    expect(edges['static ./kept']).toEqual(['binding', ['kept']])
  })
})

describe('require edge names (J6.3)', () => {
  // a mock of a denied CommonJS or unknown target owns the names the
  // importer reads: the keys it destructures, the members it reads of the
  // binding or of the call; `'*'` when the result escapes
  it('records the names a require() result is read by', async () => {
    const host = new MemoryHost({
      files: {
        '/app/m.ts': dedent(`
          const { secret, token: t } = require('./a.server')
          const b = require('./b.server')
          const c = require('./c.server')
          const d = require('./d.server').only
          const e = require('./e.server')
          export const run = () => secret + t + b.one + b['two'] + d + e()
          export const leak = c
          export const later = () => import('./f.server')
        `),
      },
    })
    const rec = edgeRecorder()
    await host.compile('/app/m.ts', [rec])
    const edges = byspec(rec.edges.env!)
    expect(edges['require ./a.server']).toEqual([
      'evaluation',
      ['secret', 'token'],
    ])
    expect(edges['require ./b.server']).toEqual(['evaluation', ['one', 'two']])
    expect(edges['require ./c.server']).toEqual(['evaluation', ['*']])
    expect(edges['require ./d.server']).toEqual(['evaluation', ['only']])
    expect(edges['require ./e.server']).toEqual(['evaluation', ['*']])
    expect(edges['dynamic ./f.server']).toEqual(['evaluation', []])
  })
})

describe('dynamic edges (J6.3)', () => {
  // an output's edges are the imports its code holds: a dynamic import in
  // code another output renders (a split component) or no output renders
  // (erased) is no edge of it
  it('a dynamic import is an edge of the outputs rendering its call only', async () => {
    const host = new MemoryHost({
      files: {
        '/app/route.tsx': dedent(`
          import { createFileRoute } from 'toy-router'
          import { wrapServer } from 'toy-start'
          const loadWidget = () => import('./widget.client')
          export const fn = wrapServer(() => import('./handler.server'))
          export const Route = createFileRoute('/')({
            component: () => [loadWidget(), import('./inline.client')],
            loader: () => import('./data'),
          })
        `),
      },
    })
    // the source edges (the split's own generated import left out)
    const specifiers = (edges: Array<EdgeRecord> | undefined) =>
      (edges ?? [])
        .filter((e) => e.form === 'dynamic' && e.provenance.origin === 'source')
        .map((e) => e.specifier)
    for (const type of ['client', 'server'] as const) {
      const rec = edgeRecorder()
      const planners = [toySplitPlanner(), toyEnvPlanner(), rec]
      const env = envInfo({ name: type, type })
      await host.compile('/app/route.tsx', planners, { env })
      await host.compile('/app/route.tsx?tsr-split=component', planners, {
        env,
      })
      const { env: envEdges, ...derived } = rec.edges
      expect(specifiers(envEdges)).toEqual(
        type === 'server' ? ['./handler.server', './data'] : ['./data'],
      )
      expect(Object.values(derived).map(specifiers)).toEqual([
        ['./widget.client', './inline.client'],
      ])
    }
  })
})

describe('policy context', () => {
  it('gives the input text and reads the input map only when asked', async () => {
    const host = new MemoryHost({
      files: { '/app/m.ts': `import { a } from './a'\nexport const b = a\n` },
    })
    let reads = 0
    const map = {
      version: 3,
      sources: ['m.mdx'],
      names: [],
      mappings: 'AAAA',
    }
    const seen: Array<string> = []
    const lazy = edgeRecorder((_edges, ctx) => {
      seen.push(ctx.code)
    })
    await host.compile('/app/m.ts', [lazy], {
      inputMap: () => {
        reads++
        return map
      },
    })
    expect(seen).toEqual([`import { a } from './a'\nexport const b = a\n`])
    expect(reads).toBe(0)

    const eager = edgeRecorder((_edges, ctx) => {
      expect(ctx.inputMap()).toBe(map)
      expect(ctx.inputMap()).toBe(map)
    })
    await host.compile('/app/m.ts', [eager], {
      config: { configKey: 'other', perPlanner: {} },
      inputMap: () => {
        reads++
        return map
      },
    })
    expect(reads).toBe(1)
  })

  it('substitutes a specifier containing quotes and line terminators as a valid literal', async () => {
    const host = new MemoryHost({
      files: { '/app/m.ts': `import { a } from './a'\nexport const b = a\n` },
    })
    const planner: Planner = {
      ...edgeRecorder(),
      policy(_plan, _output, edges, ctx) {
        ctx.substitute(edges[0]!.edgeKey, `x'y\u2028z`)
        return Promise.resolve()
      },
    }
    const out = await host.compile('/app/m.ts', [planner])
    expect(out!.code).toContain(`from 'x\\'y\\u2028z'`)
  })
})

describe('target facts', () => {
  it('list evaluated imports, star re-exports and the module format', async () => {
    const host = new MemoryHost({
      files: {
        '/app/t.ts': dedent(`
          import type { T } from './types'
          import { type U } from './types2'
          import { used } from './dep'
          import './effect'
          export * from './star'
          export { x } from './named'
          export type { V } from './types3'
          export const own = 1
          export default own
        `),
        '/app/c.cjs': `module.exports = { a: 1 }\n`,
        '/app/barrel.ts': `export * from './a'\nexport { b } from './b'\nimport './c'\nexport const d = 1\n`,
        '/app/fx.ts': `export * from './a'\nglobalThis.x = 1\n`,
      },
    })
    const t = await host.rawFacts.get('/app/t.ts')
    expect(t.targetFacts).toMatchObject({
      exists: true,
      exportNames: ['default', 'own', 'x'],
      stars: ['./star'],
      imports: ['./dep', './effect', './star', './named'],
      esm: true,
      effectful: true,
    })
    // module loading is an own effect, not an effect of the module's own code
    const barrel = await host.rawFacts.get('/app/barrel.ts')
    expect(barrel.targetFacts).toMatchObject({
      effectful: true,
      codeEffects: false,
    })
    const fx = await host.rawFacts.get('/app/fx.ts')
    expect(fx.targetFacts.codeEffects).toBe(true)
    const c = await host.rawFacts.get('/app/c.cjs')
    expect(c.targetFacts.esm).toBe(false)
    const missing = await host.rawFacts.get('/app/none.ts')
    expect(missing.targetFacts).toMatchObject({ exists: false, esm: false })
  })
})

describe('target markers', () => {
  /** Reads the marker of every edge's target, as a marker-only file rule does. */
  const markerPolicy = (): Planner => ({
    name: 'marker-reader',
    tier: 0,
    gate: (t0) => t0.hasImportOrExport,
    plan() {},
    async policy(_plan, _output, edges, ctx) {
      for (const e of edges) {
        const id = await ctx.resolve(e.specifier)
        if (id) {
          await ctx.targetMarker(id)
        }
      }
    },
  })

  it("re-plans an importer that read only a target's marker when the marker changes, not when its imports or exports do", async () => {
    const host = new MemoryHost({
      files: {
        '/app/a.ts': `import { b } from './b'\nexport const a = () => b()\n`,
        '/app/b.ts': `import { v } from './c'\nexport const b = () => v\n`,
        '/app/c.ts': `export const v = 1\n`,
        '/app/d.ts': `export const v = 2\n`,
      },
    })
    const planners = [markerPolicy()]
    const env = envInfo({ type: 'client' })
    await host.compile('/app/a.ts', planners, { env })
    const edit = async (code: string) => {
      host.write('/app/b.ts', code)
      const res = await invalidate(
        host.caches,
        { path: '/app/b.ts', kind: 'change' },
        host,
      )
      return res.dependents.map((k) => k.canonicalId)
    }

    expect(
      await edit(
        `import { v } from './d'\nexport const b = () => v\nexport const more = 1\n`,
      ),
    ).toEqual([])
    expect(
      await edit(
        `import 'server-only'\nimport { v } from './d'\nexport const b = () => v\n`,
      ),
    ).toEqual(['/app/a.ts'])
  })
})

describe('markers', () => {
  it('a transform and a raw read of a module agree on its marker', async () => {
    const host = new MemoryHost({
      files: {
        '/app/m.ts': `import 'start/server-only'\nexport const a = 1\n`,
      },
      markerSpecifiers: { 'start/server-only': 'server-only' },
    })
    let marker: unknown
    const rec: Planner = {
      ...edgeRecorder(),
      policy(plan) {
        marker = plan.facts.marker
        return Promise.resolve()
      },
    }
    await host.compile('/app/m.ts', [rec])
    expect(marker).toBe('server-only')
    const raw = await host.rawFacts.get('/app/m.ts')
    expect(raw.targetFacts.marker).toBe('server-only')
  })
})

/** A tier-0 policy that denies edges resolving to a `.server` file (J6 in miniature) and logs its verdicts. */
function denyServer(verdicts: Array<string>): Planner {
  return {
    name: 'deny-server',
    tier: 0,
    gate: (t0) => t0.hasImportOrExport,
    plan() {},
    async policy(_plan, _output, edges, ctx) {
      for (const e of edges) {
        const target = await ctx.resolve(e.specifier)
        if (target !== null) {
          await ctx.targetFacts(target)
        }
        const verdict =
          target === null
            ? 'unresolved'
            : target.includes('.server')
              ? 'denied'
              : 'allowed'
        verdicts.push(`${ctx.identity.canonicalId} ${e.specifier} ${verdict}`)
        if (verdict === 'denied') {
          ctx.substitute(e.edgeKey, `mock:${e.specifier}`)
        }
      }
    },
  }
}

describe('unresolved resolutions (J6.13)', () => {
  const importer = `import { s } from './secret.server'\nexport const x = s\n`
  const key = (canonicalId: string, env = 'client') => ({
    env,
    canonicalId,
    configKey: 'cfg',
  })

  it('re-plans an importer when its denied target is deleted and recreated', async () => {
    const host = new MemoryHost({
      files: {
        '/app/a.ts': importer,
        '/app/secret.server.ts': `export const s = 1\n`,
      },
    })
    const verdicts: Array<string> = []
    const planners = [denyServer(verdicts)]
    const first = await host.compile('/app/a.ts', planners)
    expect(first!.code).toContain(`from 'mock:./secret.server'`)

    // a resolved target deleted: its path is a dependency of the importer
    delete host.files['/app/secret.server.ts']
    const removed = await invalidate(
      host.caches,
      { path: '/app/secret.server.ts', kind: 'unlink' },
      host,
    )
    expect(removed.dependents).toEqual([key('/app/a.ts')])
    const second = await host.compile('/app/a.ts', planners)
    expect(second!.code).toContain(`from './secret.server'`)

    // an unrelated add re-resolves the failed resolution, which still fails
    host.write('/app/other.ts', `export {}\n`)
    const unrelated = await invalidate(
      host.caches,
      { path: '/app/other.ts', kind: 'add' },
      host,
    )
    expect(unrelated.dependents).toEqual([])
    expect(
      host.caches.plans.get('client')!.get(key('/app/a.ts')),
    ).not.toBeNull()

    // the target recreated: the failed resolution now resolves
    host.write('/app/secret.server.ts', `export const s = 2\n`)
    const added = await invalidate(
      host.caches,
      { path: '/app/secret.server.ts', kind: 'add' },
      host,
    )
    expect(added.dependents).toEqual([key('/app/a.ts')])
    const third = await host.compile('/app/a.ts', planners)
    expect(third!.code).toContain(`from 'mock:./secret.server'`)
    expect(verdicts).toEqual([
      '/app/a.ts ./secret.server denied',
      '/app/a.ts ./secret.server unresolved',
      '/app/a.ts ./secret.server denied',
    ])
  })

  it('re-resolves each failed resolution once per event, in every env', async () => {
    const host = new MemoryHost({
      files: { '/app/a.ts': importer, '/app/b.ts': importer },
    })
    const planners = [denyServer([])]
    const server = envInfo({ name: 'ssr', type: 'server' })
    for (const id of ['/app/a.ts', '/app/b.ts']) {
      await host.compile(id, planners)
      await host.compile(id, planners, { env: server })
    }
    host.write('/app/secret.server.ts', `export const s = 1\n`)
    host.resolveCalls.length = 0
    const r = await invalidate(
      host.caches,
      { path: '/app/secret.server.ts', kind: 'add' },
      host,
    )
    expect(r.dependents).toEqual([
      key('/app/a.ts'),
      key('/app/b.ts'),
      key('/app/a.ts', 'ssr'),
      key('/app/b.ts', 'ssr'),
    ])
    expect(host.resolveCalls).toHaveLength(4)
    // a plain change re-resolves nothing
    host.resolveCalls.length = 0
    await invalidate(
      host.caches,
      { path: '/app/other.ts', kind: 'change' },
      host,
    )
    expect(host.resolveCalls).toEqual([])
  })

  it('re-resolves the failed resolutions of a plan that also depends on the added path', async () => {
    // './x' always resolves to its path; './y' resolves once './x' exists (a redirecting resolver)
    const host = new MemoryHost({
      files: {
        '/app/a.ts': `import { x } from './x'\nimport { y } from './y.server'\nexport const z = x + y\n`,
        '/app/y.server.ts': `export const y = 1\n`,
      },
      resolve: (spec, _importer, files) =>
        spec === './x'
          ? '/app/x.ts'
          : spec === './y.server' && '/app/x.ts' in files
            ? '/app/y.server.ts'
            : null,
    })
    // resolution fingerprints only: the path bucket of '/app/x.ts' stays current
    const resolveOnly: Planner = {
      ...edgeRecorder(),
      async policy(_plan, _output, edges, ctx) {
        for (const e of edges) {
          await ctx.resolve(e.specifier)
        }
      },
    }
    await host.compile('/app/a.ts', [resolveOnly])
    host.write('/app/x.ts', `export const x = 1\n`)
    const r = await invalidate(
      host.caches,
      { path: '/app/x.ts', kind: 'add' },
      host,
    )
    expect(r.dependents).toEqual([key('/app/a.ts')])
  })

  it('forgets the failed resolutions of an evicted plan', async () => {
    const host = new MemoryHost({ files: { '/app/a.ts': importer } })
    await host.compile('/app/a.ts', [denyServer([])])
    host.write('/app/a.ts', `export const x = 1\n`)
    await invalidate(host.caches, { path: '/app/a.ts', kind: 'change' }, host)
    await host.compile('/app/a.ts', [denyServer([])])
    host.write('/app/secret.server.ts', `export const s = 1\n`)
    host.resolveCalls.length = 0
    const r = await invalidate(
      host.caches,
      { path: '/app/secret.server.ts', kind: 'add' },
      host,
    )
    expect(r.dependents).toEqual([])
    expect(host.resolveCalls).toEqual([])
  })
})

describe('language override (non-JS ids compiled as JS)', () => {
  const vueJs = `import { s } from './secret.server'\nconst n: number = 1\nexport default { s, n }\n`

  function tier1Probe(runs: Array<string>): Planner {
    return {
      name: 'tier1-probe',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        runs.push(ctx.identity.canonicalId)
      },
    }
  }

  it('compiles a non-JS id with Tier 0 planners only', async () => {
    const host = new MemoryHost({
      files: {
        '/app/Comp.vue': vueJs,
        '/app/secret.server.ts': `export const s = 1\n`,
      },
    })
    const verdicts: Array<string> = []
    const runs: Array<string> = []
    const planners = [tier1Probe(runs), denyServer(verdicts)]
    expect(await host.compile('/app/Comp.vue', planners)).toBeNull()
    const out = await host.compile('/app/Comp.vue', planners, { lang: 'ts' })
    expect(out!.code).toBe(
      vueJs.replace(`'./secret.server'`, `'mock:./secret.server'`),
    )
    expect(verdicts).toEqual(['/app/Comp.vue ./secret.server denied'])
    expect(runs).toEqual([])
  })

  it('ignores the override for a JS/TS id', async () => {
    const host = new MemoryHost({ files: { '/app/m.ts': vueJs } })
    const runs: Array<string> = []
    const lang: Lang = 'js'
    const out = await host.compile('/app/m.ts', [tier1Probe(runs)], { lang })
    expect(out!.diagnostics).toEqual([])
    expect(runs).toEqual(['/app/m.ts'])
  })
})
