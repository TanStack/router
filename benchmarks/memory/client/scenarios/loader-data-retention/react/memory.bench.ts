import { afterAll, beforeAll, bench, describe } from 'vitest'
import {
  createDeterministicRandom,
  memoryBenchOptions,
  randomSegment,
} from '../../../bench-utils'
import { setup } from './setup'

const loaderDataRetentionNavigationCount = 20
const pageIds = createPageIds()

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
    'mem loader-data-retention (react)',
    async () => {
      for (const id of pageIds) {
        await test.navigate(id)
      }
    },
    {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})

function createPageIds() {
  const random = createDeterministicRandom(11)

  return Array.from(
    { length: loaderDataRetentionNavigationCount },
    (_, index) => `${index}-${randomSegment(random)}`,
  )
}
