import { test } from 'vitest'
import {
  memoryBenchHooks,
  memoryBenchOptions,
} from '#memory-server/bench-utils'
import { workloadGroup } from './setup'

await workloadGroup.sanity()

test('memory', async ({ bench }) => {
  for (const workload of workloadGroup.workloads) {
    await bench(workload.name, memoryBenchHooks(), workload.run).run(
      memoryBenchOptions,
    )
  }
})
