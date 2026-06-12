import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  createDeterministicRandom,
  memoryBenchOptions,
  randomSegment,
} from '../../../bench-utils'
import { setup } from './setup'

const preloadChurnIterations = 200
// A navigation commit is what triggers the router's clearExpiredCache —
// preloaded matches (defaultPreloadGcTime: 0) are only evicted then, never
// during a preload-only loop. Interleaving a navigation every few preloads is
// what makes the flat floor assert "eviction releases preloaded payloads".
const preloadsPerEvictionNavigation = 10
// Module-level so ids stay unique across the CodSpeed runner's multiple
// invocations (warmup + measured) of the bench fn on one mount; a
// per-invocation LCG would replay identical ids, and every preload after the
// first invocation would dedupe against cachedMatches instead of doing work.
const benchmarkRandom = createDeterministicRandom(0x706c6f61)
let preloadCounter = 0

await setup().sanity()

describe('memory', () => {
  const test = setup()

  /**
   * Plain `vitest bench` never runs suite hooks (beforeAll/afterAll) and only
   * honors tinybench's setup/teardown options; the CodSpeed runner does the
   * exact opposite. Both registrations are load-bearing — exactly one pair
   * runs in any given mode.
   */
  beforeAll(test.before)
  afterAll(test.after)

  bench(
    'mem preload-churn (react)',
    async () => {
      for (let index = 0; index < preloadChurnIterations; index++) {
        await test.preload(
          `${(preloadCounter++).toString(36)}-${randomSegment(benchmarkRandom)}`,
        )

        if ((index + 1) % preloadsPerEvictionNavigation === 0) {
          await test.evictPreloads()
        }
      }
    },
    {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
