import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  createDeterministicRandom,
  memoryBenchOptions,
  randomSegment,
} from '../../../bench-utils'
import { setup } from './setup'

const interruptedNavigationIterations = 150

const interruptedNavigationPairs = createInterruptedNavigationPairs(
  interruptedNavigationIterations,
)

function createInterruptedNavigationPairs(iterations: number) {
  const random = createDeterministicRandom(13)

  return Array.from({ length: iterations }, (_, index) => ({
    slowId: `slow-${index}-${randomSegment(random)}`,
    fastId: `fast-${index}-${randomSegment(random)}`,
  }))
}

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
    'mem interrupted-navigations (react)',
    async () => {
      for (const pair of interruptedNavigationPairs) {
        await test.interrupt(pair.slowId, pair.fastId)
      }
    },
    {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
