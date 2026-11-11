// Module-size scaling of one compile (review of 2026-11-10, F9-3: a query of
// the rewrite tree scanned every edit, so a module of many server functions
// compiled in time quadratic in their number).
import { describe, expect, it, vi } from 'vitest'
import type { Planner } from '../src/compiler'

/** A module of `n` exported server functions, each reading a helper of its own. */
function serverModule(n: number): string {
  const lines = [`import { wrapServer } from 'toy-start'`]
  for (let i = 0; i < n; i++) {
    lines.push(`const helper${i} = (x) => x + ${i}`)
    lines.push(`export const fn${i} = wrapServer(() => helper${i}(${i}))`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * The client side of a server function, each `wrapServer(…)` call a stub,
 * and a rename of every reference and exported name (found in the text and
 * the reference index: the planner's own lookups are not measured).
 */
const stubs: Planner = {
  name: 'toy-stubs',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    for (const m of code.matchAll(/wrapServer\(.*\)/g)) {
      ctx.rewrites.edit({
        range: { start: m.index, end: m.index + m[0].length },
        body: [{ k: 'text', parts: ['tsrStub()'] }],
        by: 'toy-stubs',
      })
    }
    const rename = (start: number, end: number) =>
      ctx.rewrites.edit({
        range: { start, end },
        body: [{ k: 'text', parts: [`${code.slice(start, end)}_`] }],
        by: 'toy-stubs',
      })
    for (const ref of ctx.t1.refs.all) {
      rename(ref.range.start, ref.range.end)
    }
    for (const m of code.matchAll(/export const (fn\d+)/g)) {
      const start = m.index + 'export const '.length
      rename(start, start + m[1]!.length)
    }
  },
}

/**
 * The provider side: every handler claimed and hoisted into a unit of its
 * own (the owner renders the claimed region), and the same renames.
 */
const hoists: Planner = {
  name: 'toy-hoists',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    let i = 0
    for (const m of code.matchAll(/wrapServer\((.*)\)/g)) {
      const start = m.index + 'wrapServer('.length
      const range = { start, end: start + m[1]!.length }
      const region = ctx.region(range, 'custom')
      const local = ctx.names.alloc(`tsrH${i++}`)
      const owner = ctx.rewrites.addGenerated({
        body: [
          { k: 'text', parts: ['const ', { sym: local.sym }, ' = '] },
          { k: 'region', id: region },
          { k: 'text', parts: ['\n'] },
        ],
        declares: [local.sym],
        effectful: false,
        anchor: { k: 'end' },
        home: 'auto',
        by: 'toy-hoists',
      })
      ctx.rewrites.claim({
        region,
        owner,
        placeholder: [{ k: 'text', parts: [{ sym: local.sym }] }],
        by: 'toy-hoists',
      })
    }
    const rename = (start: number, end: number) =>
      ctx.rewrites.edit({
        range: { start, end },
        body: [{ k: 'text', parts: [`${code.slice(start, end)}_`] }],
        by: 'toy-hoists',
      })
    for (const ref of ctx.t1.refs.all) {
      rename(ref.range.start, ref.range.end)
    }
  },
}

describe('module-size scaling', () => {
  // (users' runs: the test runs' output checks are not what is measured)
  /**
   * Median compile time of a module of 6,400 against one of 400 (client
   * compile, fresh caches each time). The two sizes are sampled alternately,
   * so load from other processes weighs on both alike. At 16 times the size,
   * linear time reads about 15 to 21 (up to 34 under heavy load) and quadratic
   * about 256, so the bound of 48 tells them apart with room for load.
   */
  async function ratio(
    planner: Planner,
    check: (code: string, n: number) => void,
  ): Promise<number> {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost } = await import('./helpers')
      const sample = async (n: number, code: string): Promise<number> => {
        const host = new MemoryHost({ files: { '/app/fns.ts': code } })
        const t = performance.now()
        const out = await host.compile('/app/fns.ts', [planner])
        const elapsed = performance.now() - t
        check(out!.code, n)
        return elapsed
      }
      const small = serverModule(400)
      const large = serverModule(6400)
      // warm the compiler's code paths first
      await sample(400, small)
      await sample(6400, large)
      const smalls: Array<number> = []
      const larges: Array<number> = []
      for (let i = 0; i < 9; i++) {
        smalls.push(await sample(400, small))
        larges.push(await sample(6400, large))
      }
      const median = (xs: Array<number>) => xs.sort((a, b) => a - b)[4]!
      return median(larges) / median(smalls)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  }

  it('compiles a module of 6,400 server functions in less than 48 times one of 400', async () => {
    const r = await ratio(stubs, (code, n) => {
      expect(code).toContain(`export const fn${n - 1}_ = tsrStub()`)
      expect(code).not.toContain('helper')
    })
    expect(r).toBeLessThan(48)
  }, 60_000)

  it('compiles a module of 6,400 hoisted server functions in less than 48 times one of 400', async () => {
    const r = await ratio(hoists, (code, n) => {
      expect(code).toContain(
        `const tsrH${n - 1} = () => helper${n - 1}_(${n - 1})`,
      )
    })
    expect(r).toBeLessThan(48)
  }, 60_000)
})
