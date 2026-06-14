import { afterAll, beforeAll, bench, describe } from 'vitest'
import { clientNavBenchOptions } from '#client-nav/bench-utils'
import { workload } from './setup'

await workload.sanity()

describe('client-nav hydration-resume', () => {
  beforeAll(workload.before)
  afterAll(workload.after)

  bench(workload.name, workload.run, {
    ...clientNavBenchOptions,
    setup: workload.before,
    teardown: workload.after,
  })
})
