import { afterAll, beforeAll, bench, describe } from 'vitest'
import { memoryBenchOptions } from '../../../bench-utils'
import { setup } from './setup'

const navigationChurnIterations = 300

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
    'mem navigation-churn (react)',
    async () => {
      for (let index = 0; index < navigationChurnIterations; index++) {
        await test.navigate(index % 2 === 0 ? '/b' : '/a')
      }
    },
    {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
