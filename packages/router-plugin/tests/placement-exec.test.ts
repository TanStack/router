/**
 * The executing placement property on the router planner, unit tier: a
 * fixed seed range (`PX_SEEDS=<from>-<to>` widens it); the slow tier runs a
 * larger one (`integration/placement-exec.test.ts`). In process, through
 * the public compiler API: the property compares what the source and its
 * outputs do when run as ES modules, not where code goes.
 */
import { describe, expect, it } from 'vitest'
import {
  disagreements,
  routerConfigs,
  seedRange,
} from './placement-exec-configs'

describe('the executing placement property (router planner)', () => {
  const [from, to] = seedRange(process.env.PX_SEEDS, [1, 150])
  it(`what the outputs do is what the source does (seeds ${from}-${to})`, async () => {
    expect(
      await disagreements(routerConfigs, from, to, { builders: false }),
    ).toEqual([])
  }, 600_000)
})
