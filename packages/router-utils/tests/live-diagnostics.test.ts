import { describe, expect, it } from 'vitest'
import { MemoryHost, dedent, toyEnvPlanner, toySplitPlanner } from './helpers'
import type { Planner, Range } from '../src/compiler'

/**
 * Reports a `liveDiagnostic` at every `MARK` of the module (with
 * `unlessLive`: every `READ` of it), and rewrites each `OWN` to `0` (an edit
 * on exactly the diagnostic's range).
 */
function toyLivePlanner(
  opts: { unlessLive?: boolean; at?: boolean } = {},
): Planner {
  return {
    name: 'toy-live',
    tier: 1,
    gate: () => true,
    plan(ctx) {
      const code = ctx.analysis.source.code
      const all = (word: string): Array<Range> => {
        const out: Array<Range> = []
        for (
          let i = code.indexOf(word);
          i !== -1;
          i = code.indexOf(word, i + 1)
        ) {
          out.push({ start: i, end: i + word.length })
        }
        return out
      }
      for (const range of all('OWN')) {
        ctx.rewrites.add({
          range,
          body: [{ k: 'text', parts: ['0'] }],
          scope: 'all-outputs',
          by: 'toy-live',
        })
      }
      for (const range of [...all('MARK'), ...all('OWN')]) {
        ctx.liveDiagnostic(
          { severity: 'error', message: 'used', range, by: 'toy-live' },
          opts.unlessLive
            ? { unlessLive: all('READ') }
            : opts.at
              ? { at: all('AT')[0] }
              : {},
        )
      }
    },
  }
}

/** The lines of the client output's diagnostics. */
async function reported(
  code: string,
  opts: { unlessLive?: boolean; at?: boolean } = {},
) {
  const source = dedent(code)
  const host = new MemoryHost({ files: { '/app/m.ts': source } })
  const out = await host.compile('/app/m.ts', [
    toyEnvPlanner(),
    toyLivePlanner(opts),
  ])
  return out!.diagnostics.map(
    (d) => source.slice(0, d.range!.start).split('\n').length,
  )
}

describe('diagnostics about code that ships', () => {
  it('reports code that ships, and an edit on exactly its range does not hide it', async () => {
    expect(
      await reported(`
        import { wrapServer } from 'toy-start'
        export const a = [MARK]
        export const b = OWN
        export const fn = wrapServer(() => 1)
      `),
    ).toEqual([2, 3])
  })

  it('drops what an erasure took, and what only erased code read', async () => {
    expect(
      await reported(`
        import { wrapServer } from 'toy-start'
        const onlyServer = () => [MARK]
        export const fn = wrapServer(() => [MARK, onlyServer()])
        export function local() {
          const helper = () => [MARK]
          return wrapServer(() => helper())
        }
        export const kept = () => [MARK]
      `),
    ).toEqual([8])
  })

  it('judges `at` instead of the range: a use erased in a declaration that ships', async () => {
    const live = `
        import { wrapServer } from 'toy-start'
        export const fn = (AT) => wrapServer(() => MARK)
      `
    expect(await reported(live)).toEqual([])
    expect(await reported(live, { at: true })).toEqual([2])
    expect(
      await reported(
        `
        import { wrapServer } from 'toy-start'
        export const fn = wrapServer(() => (AT) => MARK)
      `,
        { at: true },
      ),
    ).toEqual([])
  })

  it('drops one when a range of `unlessLive` ships, reports it when every one was erased', async () => {
    expect(
      await reported(
        `
        import { wrapServer } from 'toy-start'
        export const fn = (MARK) => wrapServer(() => READ)
      `,
        { unlessLive: true },
      ),
    ).toEqual([2])
    expect(
      await reported(
        `
        import { wrapServer } from 'toy-start'
        export const fn = (MARK) => [READ, wrapServer(() => READ)]
      `,
        { unlessLive: true },
      ),
    ).toEqual([])
  })
})

describe('a module whose code is no JS/TS of its own (`.mdx`)', () => {
  const code = `import { wrapServer } from 'toy-start'\nexport const fn = wrapServer(() => 1)\n`
  const host = () => new MemoryHost({ files: { '/app/page.mdx': code } })

  it('runs Tier 1 planners only in place', async () => {
    const tier0 = await host().compile('/app/page.mdx', [toyEnvPlanner()], {
      lang: 'jsx',
    })
    expect(tier0?.code ?? code).toBe(code)
    const inPlace = await host().compile('/app/page.mdx', [toyEnvPlanner()], {
      lang: 'jsx',
      inPlace: true,
    })
    expect(inPlace!.code).toContain('tsrStub()')
  })

  it('throws when an in-place plan declares a derived output', async () => {
    await expect(
      host().compile('/app/page.mdx', [toySplitPlanner()], {
        lang: 'jsx',
        inPlace: true,
        code: `import { createFileRoute } from 'toy-router'\nexport const Route = createFileRoute('/')({ component: () => null })\n`,
      }),
    ).rejects.toThrow(/derived output/)
  })
})
