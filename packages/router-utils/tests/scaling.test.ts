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
      ctx.rewrites.add({
        range: { start: m.index, end: m.index + m[0].length },
        body: [{ k: 'text', parts: ['tsrStub()'] }],
        scope: 'all-outputs',
        by: 'toy-stubs',
      })
    }
    const rename = (start: number, end: number) =>
      ctx.rewrites.add({
        range: { start, end },
        body: [{ k: 'text', parts: [`${code.slice(start, end)}_`] }],
        scope: 'all-outputs',
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

describe('module-size scaling', () => {
  // (users' runs: the test runs' output checks are not what is measured)
  it('compiles a module of 1,600 server functions in less than 6 times one of 400', async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost } = await import('./helpers')
      /** The median time of a client compile, fresh caches each time. */
      const time = async (n: number): Promise<number> => {
        const code = serverModule(n)
        const samples: Array<number> = []
        for (let i = 0; i < 7; i++) {
          const host = new MemoryHost({ files: { '/app/fns.ts': code } })
          const t = performance.now()
          const out = await host.compile('/app/fns.ts', [stubs])
          samples.push(performance.now() - t)
          expect(out!.code).toContain(`export const fn${n - 1}_ = tsrStub()`)
          expect(out!.code).not.toContain('helper')
        }
        return samples.sort((a, b) => a - b)[3]!
      }
      // warm the compiler's code paths first
      await time(400)
      const small = await time(400)
      const large = await time(1600)
      expect(large / small).toBeLessThan(6)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  }, 60_000)
})
