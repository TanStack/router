import { bench } from 'vitest'
import { memoryBenchOptions } from './bench-utils'
import type { ServerMemoryBenchmark } from './benchmark'

export function registerServerMemoryBenches(test: ServerMemoryBenchmark) {
  for (const memoryBench of test.benches) {
    bench(memoryBench.name, memoryBench.run, memoryBenchOptions)
  }
}
