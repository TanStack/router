import { test } from 'vitest'
import {
  memoryBenchHooks,
  memoryBenchOptions,
} from '#memory-server/bench-utils'
import { workloadGroup } from './setup'

await workloadGroup.sanity()

const workload = workloadGroup.workloads[1]!

test('memory', async ({ bench }) => {
  await bench(workload.name, memoryBenchHooks(), workload.run).run(
    memoryBenchOptions,
  )
})
