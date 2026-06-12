import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  createDeterministicRandom,
  memoryBenchOptions,
  randomSegment,
} from '../../../bench-utils'
import { setup } from './setup'

const benchmarkRandom = createDeterministicRandom(0xdecafbad)
const uniqueLocationChurnIterations = 300
// Module-level so ids stay unique across the CodSpeed runner's multiple
// invocations (warmup + measured) of the bench fn on one mount; the counter
// prefix removes any residual LCG birthday-collision risk.
let locationCounter = 0

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
    'mem unique-location-churn (react)',
    async () => {
      for (let index = 0; index < uniqueLocationChurnIterations; index++) {
        const id = `${(locationCounter++).toString(36)}-${randomSegment(benchmarkRandom)}`
        const q = `q-${randomSegment(benchmarkRandom)}`

        await test.navigate({ id, q })
      }
    },
    {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
