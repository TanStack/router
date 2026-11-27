/**
 * Kept: the sole coverage of two paths no oracle test reaches yet: a
 * planner's lazy module (Start's handler module) whose region
 * is a function passed to a call, and a destructured binding that only a call
 * every output erases reads, inside a split option. The second has a
 * start-plugin-core build row (env separation: a server-only fn in a route
 * component); this one stays for what only it reaches (a text cutting an
 * inactive rewrite, `OutputView.walkLevel`; a pattern target's removal).
 */
import { describe, expect, it } from 'vitest'
import {
  MemoryHost,
  dedent,
  envInfo,
  toyEnvPlanner,
  toySplitPlanner,
} from './helpers'
import type { Planner } from '../src/compiler'

/** The env module and the component chunk of `/app/route.tsx` (a client dev compile). */
async function split(code: string, files: Record<string, string> = {}) {
  const host = new MemoryHost({ files: { '/app/route.tsx': code, ...files } })
  const planners = [toyEnvPlanner(), toySplitPlanner()]
  const env = await host.compile('/app/route.tsx', planners)
  const chunk = await host.compile(
    '/app/route.tsx?tsr-split=component',
    planners,
  )
  return { env: env?.code ?? '', chunk: chunk?.code ?? '' }
}

describe('a declaration only a chunk reads moves with its initialiser', () => {
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
      '/app/db.ts': `export const secret = () => 's'\n`,
    })
    expect(r.env).toContain('const { kept } = source')
    expect(r.env).not.toContain('secret')
    expect(r.chunk).not.toContain('secret')
    // (the component is the chunk's, its server call erased; the route
    // module loads it lazily)
    expect(r.chunk).toMatch(
      /const (\w+) = \(\) => tsrStub\(\)\nexport \{ \1 as component \}/,
    )
    expect(r.env).toMatch(/component: .*lazyRouteComponent\(/)
    expect(r.env).not.toContain('wrapServer')
  })
})

// What a function a declaration or an option value holds, passes to a call
// or calls at load does decides nothing: placement reads names, references
// and assignments. Source: review of 2026-11-10, F1 (F1-1,
// F1-2, F1-3a, F1-5a, Q2).
describe('functions held, passed or called at load', () => {
  const lib = { '/app/lib.ts': 'export const f = (x: unknown) => x\n' }
  /** The env module's compile of `/app/route.tsx` (a client build). */
  const compile = (code: string, planners: Array<Planner>) =>
    new MemoryHost({ files: { '/app/route.tsx': code, ...lib } }).compile(
      '/app/route.tsx',
      planners,
      { env: envInfo({ mode: 'build' }) },
    )

  // a custom region in an exported declaration's call argument (a server
  // fn's handler) moved to a lazy module falls back for nothing it reads;
  // one that assigns the module's state falls back (the lazy module could
  // only write its copy)
  it.each([
    [
      'no fallback for a custom region that is a function passed to a call',
      '() => String(n)',
      false,
    ],
    [
      'a fallback for a custom region that is a function passed to a call assigning module state',
      '() => { n++ }',
      true,
    ],
  ])('reports %s', async (_, argument, reason) => {
    const code = dedent(`
        import { createFileRoute } from 'toy-router'
        import { f } from './lib'
        let n = 0
        export function inc() { n++ }
        export const job = f(${argument})
        export const Route = createFileRoute('/')({ component: () => null })
      `)
    // (as Start's lazy handler module: the region claimed into a lazy
    // output, left in place once it falls back)
    const region: Planner = {
      name: 'toy-region',
      tier: 1,
      gate: () => true,
      plan(ctx) {
        const start = ctx.analysis.source.code.indexOf(argument)
        const range = { start, end: start + argument.length }
        const fallback = ctx.fallbackAt(range, 'custom') !== undefined
        ctx.setFacts('toy-region', { fallback })
        if (fallback) {
          return
        }
        const out = ctx.declareOutput({
          kind: 'custom',
          key: 'handler',
          derived: { kind: 'handler', value: '' },
        })
        const id = ctx.region(range, 'custom')
        const owner = ctx.rewrites.addGenerated({
          body: [
            { k: 'text', parts: ['export const handler = '] },
            { k: 'region', id },
            { k: 'text', parts: ['\n'] },
          ],
          declares: [],
          effectful: false,
          anchor: { k: 'end' },
          home: out,
          by: 'toy-region',
        })
        ctx.addRoot(out, { t: 'gen', id: owner })
        ctx.rewrites.claim({
          region: id,
          owner,
          placeholder: [{ k: 'text', parts: ['() => null'] }],
          by: 'toy-region',
        })
      },
    }
    const main = await compile(code, [toySplitPlanner(), region])
    expect(main?.facts.planners['toy-region']).toEqual({
      fallback: reason,
    })
  })
})
