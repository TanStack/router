import { afterAll, beforeAll, bench, describe } from 'vitest'
import { clientNavBenchOptions } from '#client-nav/bench-utils'
import { workload } from './setup'

const deferredAwaitBenchOptions = {
  ...clientNavBenchOptions,
  warmupIterations: 1,
}

await workload.sanity()

describe('client-nav', () => {
  beforeAll(workload.before)
  afterAll(workload.after)

  bench(workload.name, workload.run, {
    ...deferredAwaitBenchOptions,
    setup: workload.before,
    teardown: workload.after,
  })
})
