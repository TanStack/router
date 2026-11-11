/**
 * The executing placement property on the router planner, slow tier: the
 * seeds after the unit tier's (`../placement-exec.test.ts`), in batches (a
 * process holding many `node:vm` contexts slows down).
 */
import { describe, expect, it } from 'vitest'
import {
  disagreements,
  routerConfigs,
  seedRange,
} from '../placement-exec-configs'

const [from, to] = seedRange(process.env.PX_SLOW_SEEDS, [151, 1150])
const batch = 250

describe('the executing placement property (router planner, more seeds)', () => {
  for (let a = from; a <= to; a += batch) {
    const b = Math.min(to, a + batch - 1)
    it(`what the outputs do is what the source does (seeds ${a}-${b})`, async () => {
      expect(
        await disagreements(routerConfigs, a, b, { builders: false }),
      ).toEqual([])
    }, 600_000)
  }
})
