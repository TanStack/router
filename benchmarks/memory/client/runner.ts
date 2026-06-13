import { afterAll, beforeAll, bench } from 'vitest'
import { memoryBenchOptions } from './bench-utils'
import type { ClientMemoryBenchmark } from './benchmark'

export function registerClientMemoryBench(test: ClientMemoryBenchmark) {
  if (test.before && test.after) {
    /**
     * Plain `vitest bench` never runs suite hooks (beforeAll/afterAll) and only
     * honors tinybench's setup/teardown options; the CodSpeed runner does the
     * exact opposite. Both registrations are load-bearing: exactly one pair
     * runs in any given mode.
     */
    beforeAll(test.before)
    afterAll(test.after)

    bench(test.name, test.run, {
      ...memoryBenchOptions,
      setup: test.before,
      teardown: test.after,
    })
    return
  }

  bench(test.name, test.run, memoryBenchOptions)
}
