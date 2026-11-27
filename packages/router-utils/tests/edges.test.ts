/**
 * Kept: the sole coverage of two Start paths no oracle test reaches yet, to
 * become start-plugin-core behaviour tests: the names a CommonJS `require()`
 * result is read by (an import-protection mock of a denied CommonJS target),
 * and a resolver that throws during a dev invalidation (the plan is stale).
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '../src/compiler'
import { MemoryHost, dedent, staleAfter } from './helpers'
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
    policy(_plan, output, planEdges, ctx) {
      const outputEdges = planEdges[output] ?? []
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

/** A tier-0 policy that denies edges resolving to a `.server` file (J6 in miniature) and logs its verdicts. */
function denyServer(verdicts: Array<string>): Planner {
  return {
    name: 'deny-server',
    tier: 0,
    gate: (t0) => t0.hasImportOrExport,
    plan() {},
    async policy(_plan, output, edges, ctx) {
      for (const e of edges[output] ?? []) {
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

  // A file event or a registry publication runs the invalidation, with nobody
  // to answer a rejection: what can't be checked counts as stale, and the next
  // compile asks the resolver again and reports what it says.
  it('counts a plan stale when its resolution throws during an invalidation', async () => {
    const host = new MemoryHost({
      files: {
        '/app/a.ts': importer,
        '/app/secret.server.ts': `export const s = 1\n`,
      },
    })
    const planners = [denyServer([])]
    await host.compile('/app/a.ts', planners)
    host.write('/app/other.ts', `export {}\n`)
    await invalidate(host.caches, { path: '/app/other.ts', kind: 'add' }, host)
    const errors: Array<unknown> = []
    const failing = {
      rawFacts: host.rawFacts,
      resolve: () => Promise.reject(new Error('resolver failed')),
      onInvalidationError: (error: unknown) => errors.push(error),
    }
    const res = await staleAfter(
      host.caches,
      { path: '/app/secret.server.ts', kind: 'registry' },
      failing,
    )
    // (a registry change stales its own file too)
    expect(res).toEqual(['/app/a.ts', '/app/secret.server.ts'])
    expect(errors).toEqual([new Error('resolver failed')])
    expect(host.caches.plans.get('client')!.get(key('/app/a.ts'))).toBeNull()
  })
})
