import { test } from 'vitest'
import {
  memoryBenchHooks,
  memoryBenchOptions,
} from '#memory-client/bench-utils'
import { workload } from './setup'

await workload.sanity()

test('memory', async ({ bench }) => {
  await bench(workload.name, memoryBenchHooks(workload), workload.run).run(
    memoryBenchOptions,
  )
})
