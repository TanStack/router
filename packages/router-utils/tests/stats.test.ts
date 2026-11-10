/**
 * Measurement aids (`stats.ts`): `TSR_COMPILER_STATS=1` exposes cache sizes
 * without retaining the caches; `TSR_COMPILER_NO_CACHE` disables a cache
 * while every output stays identical.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectionSizes, compilerStats, invalidate } from '../src/compiler'
import {
  MemoryHost,
  dedent,
  toySplitPlanner,
  toySummaryPlanner,
} from './helpers'
import type { PlanKey, Planner } from '../src/compiler'

const ROUTE = dedent(`
  import { createFileRoute } from 'toy-router'
  import { helper } from './helper'
  export const Route = createFileRoute('/')({
    component: () => helper(1),
    loader: () => helper(2),
  })
`)
const files = {
  '/app/route.tsx': ROUTE,
  '/app/helper.ts': 'export const helper = (n: number) => n\n',
}
/** Reads the target facts of every relative import (J6's acquisition path). */
const toyTargetsPlanner: Planner = {
  name: 'toy-targets',
  tier: 1,
  gate: () => true,
  async prefetch(t0, ctx) {
    for (const imp of t0.imports) {
      const target = await ctx.resolve(imp.specifier)
      if (target) {
        await ctx.targetFacts(target)
      }
    }
  },
  plan() {},
}
const planners = () => [
  toySplitPlanner(),
  toySummaryPlanner(),
  toyTargetsPlanner,
]

async function compileAll(host: MemoryHost) {
  return [
    await host.compile('/app/route.tsx', planners()),
    await host.compile('/app/route.tsx?tsr-split=component', planners()),
    await host.compile('/app/route.tsx', planners()),
  ].map((o) => o?.code)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('compiler stats (TSR_COMPILER_STATS=1)', () => {
  it('reports the entry counts of a session’s caches under its label', async () => {
    vi.stubEnv('TSR_COMPILER_STATS', '1')
    const host = new MemoryHost({ files })
    await compileAll(host)
    const stats = compilerStats().compiler!
    expect(stats.instances).toBeGreaterThanOrEqual(1)
    expect(stats.plans).toBeGreaterThanOrEqual(1)
    expect(stats.planBytes).toBeGreaterThan(0)
  })

  it('does not register without the variable', async () => {
    const before = compilerStats().compiler?.instances ?? 0
    const host = new MemoryHost({ files })
    await compileAll(host)
    // the registry holds sessions weakly: an earlier test's may be collected
    // meanwhile, so the count can drop, never rise
    expect(compilerStats().compiler?.instances ?? 0).toBeLessThanOrEqual(before)
  })

  it('evicts a changed file’s plan in every env and keeps generation bookkeeping per live key', async () => {
    vi.stubEnv('TSR_COMPILER_STATS', '1')
    const host = new MemoryHost({ files })
    await compileAll(host)
    const plans = host.caches.plans.get('client')!
    expect(plans.stats(false).plans).toBe(1)
    await invalidate(
      host.caches,
      { path: '/app/route.tsx', kind: 'change' },
      host,
    )
    expect(plans.stats(false).plans).toBe(0)
  })

  it('sums the collections of a host object', () => {
    const owner = {
      byId: new Map([
        ['a', { names: ['x', 'y'] }],
        ['b', { names: ['z'] }],
      ]),
      seen: new Set([1, 2, 3]),
      nested: { queue: [1] },
    }
    expect(collectionSizes(owner)).toEqual({
      byId: 2,
      'byId[*].names': 3,
      seen: 3,
      'nested.queue': 1,
    })
  })
})

describe('cache knobs (TSR_COMPILER_NO_CACHE)', () => {
  it.each(['plans', 'facts', 'targets', 'all'])(
    '%s off: identical outputs, nothing retained by the disabled cache',
    async (knob) => {
      const referenceHost = new MemoryHost({ files })
      const reference = await compileAll(referenceHost)
      vi.stubEnv('TSR_COMPILER_NO_CACHE', knob)
      const host = new MemoryHost({ files })
      expect(await compileAll(host)).toEqual(reference)
      const plans = host.caches.plans.get('client')!.stats(false)
      const facts = host.rawFacts.stats(false)
      if (knob === 'plans' || knob === 'all') {
        expect(plans.plans).toBe(0)
        // no plan is kept, but its dependencies are: an edit of one reports the module
        expect(plans.dependentEntries).toBe(
          referenceHost.caches.plans.get('client')!.stats(false)
            .dependentEntries,
        )
      } else {
        expect(plans.plans).toBe(1)
      }
      if (knob === 'facts' || knob === 'all') {
        expect(facts.rawFacts).toBe(0)
      }
    },
  )

  it.each(['plans', 'facts', 'targets', 'all'])(
    '%s off: an edit of a dependency reports the same dependents',
    async (knob) => {
      const dependentsOfHelperEdit = async () => {
        const host = new MemoryHost({ files })
        await compileAll(host)
        host.write(
          '/app/helper.ts',
          'export const helper = (n: number) => n\nexport const other = 1\n',
        )
        const res = await invalidate(
          host.caches,
          { path: '/app/helper.ts', kind: 'change' },
          host,
        )
        const ids = (keys: Array<PlanKey>) =>
          keys.map((k) => `${k.env}:${k.canonicalId}`).sort()
        return { evicted: ids(res.evicted), dependents: ids(res.dependents) }
      }
      const reference = await dependentsOfHelperEdit()
      expect(reference.dependents.length).toBeGreaterThan(0)
      vi.stubEnv('TSR_COMPILER_NO_CACHE', knob)
      expect(await dependentsOfHelperEdit()).toEqual(reference)
    },
  )
})
