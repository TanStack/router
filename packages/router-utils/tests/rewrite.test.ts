import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { MemoryHost, dedent } from './helpers'
import type { Planner } from '../src/compiler'

// Kept: a safety net no public input reaches (as `verify` and `self-checks`).
// An edit's body names source text as a slice of the region it edits, and a
// slice that cuts a region another edit rewrites would copy the text that
// edit replaces. Such a body fails the compile, in every mode.
describe('a kept slice cuts no edited region', () => {
  const lastRangeOf = (code: string, text: string) => {
    const start = code.lastIndexOf(text)
    return { start, end: start + text.length }
  }
  /** `outer` rewrites `outerText` keeping `kept`; `inner` rewrites `innerText`. */
  const cutting = (
    code: string,
    outerText: string,
    kept: string,
    innerText: string,
  ): Planner => ({
    name: 'toy-keep',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      ctx.rewrites.edit({
        range: lastRangeOf(code, outerText),
        body: [
          { k: 'text', parts: ['keep('] },
          { k: 'slice', range: lastRangeOf(code, kept) },
          { k: 'text', parts: [')'] },
        ],
        by: 'toy-outer',
      })
      ctx.rewrites.edit({
        range: lastRangeOf(code, innerText),
        body: [{ k: 'text', parts: ['stub()'] }],
        by: 'toy-inner',
      })
    },
  })
  const between = {
    code: dedent(`
      import { outer, inner, secret } from './lib'
      outer(inner(secret))
    `),
    outer: 'outer(inner(secret))',
    kept: 'secret',
    inner: 'inner(secret)',
  }
  const straddling = {
    code: dedent(`
      import { outer, secret, other } from './lib'
      outer(secret + 1, other)
    `),
    outer: 'outer(secret + 1, other)',
    kept: '1, other',
    inner: 'secret + 1',
  }
  const compileIn = async (
    host: typeof MemoryHost,
    c: typeof between,
  ): Promise<unknown> =>
    new host({ files: { '/app/mod.ts': c.code } }).compile('/app/mod.ts', [
      cutting(c.code, c.outer, c.kept, c.inner),
    ])

  it('fails the compile when an edit lies between an edit and the slice it keeps', async () => {
    await expect(compileIn(MemoryHost, between)).rejects.toThrow(
      /conflict: .* cuts /,
    )
  })

  it('fails the compile when an edit straddles the start of a kept slice', async () => {
    await expect(compileIn(MemoryHost, straddling)).rejects.toThrow(
      /conflict: .* cuts /,
    )
  })

  // The compile's caller gets one error a user can act on: an internal
  // error to report, naming the file, with the detail after it.
  // Source: diagnostics spike (2026-11-24), inventory flag 15, Fable's
  // change 8.
  it('fails as an internal compiler error to report, naming the file, with the detail', async () => {
    const error = await compileIn(MemoryHost, between).then(
      () => undefined,
      (e: unknown) => e as Error,
    )
    expect(error?.message).toMatch(
      /^Internal compiler error in \S*mod\.ts\. Please report it at https:\/\/github\.com\/TanStack\/router\/issues with this file and the detail below\.\nconflict: .* cuts /,
    )
    // a host printing the error (Node's `inspect`, as Vite's and Rsbuild's
    // loggers do) shows the detail once (Fable's review of the
    // implementation, 6)
    expect(inspect(error).match(/conflict: /g)).toHaveLength(1)
  })

  it("fails the compile on both in users' runs", async () => {
    vi.stubEnv('TSR_COMPILER_VERIFY', undefined)
    vi.resetModules()
    try {
      const { MemoryHost: Host } = await import('./helpers')
      await expect(compileIn(Host, between)).rejects.toThrow(
        /conflict: .* cuts /,
      )
      await expect(compileIn(Host, straddling)).rejects.toThrow(
        /conflict: .* cuts /,
      )
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
