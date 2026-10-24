import { describe, expect, it } from 'vitest'
import { MemoryHost, dedent, toyEnvPlanner } from './helpers'
import type { EdgeRecord, Planner, PolicyContext } from '../src/compiler'

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

describe('edge names (J6, DESIGN §3.14.1)', () => {
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

describe('target facts (R36)', () => {
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
