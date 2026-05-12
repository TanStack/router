import { afterAll, beforeAll, bench, describe } from 'vitest'
import { runSsrRequestLoop } from '../bench-utils'
import type { StartRequestHandler } from '../bench-utils'

const appModulePath = './dist/server/server.js'
const benchmarkSeed = 0xdeadbeef

const uninitializedHandler: StartRequestHandler = {
  fetch: () => Promise.reject(new Error('Benchmark not initialized')),
}

let handler = uninitializedHandler

async function setup() {
  const module = (await import(appModulePath)) as {
    default: StartRequestHandler
  }

  handler = module.default
}

function teardown() {
  handler = uninitializedHandler
}

describe('ssr', () => {
  /**
   * Running `vitest bench` ignores "suite hooks" like `beforeAll` and `afterAll`,
   * so we use tinybench's `setup` and `teardown` options to run our setup and teardown logic.
   *
   * But CodSpeed calls the benchmarked function directly, bypassing `setup` and `teardown`,
   * but it does support `beforeAll` and `afterAll`.
   *
   * So it looks like we're setting up in duplicate, but in reality, it's only running once per environment, as intended.
   */
  beforeAll(setup)
  afterAll(teardown)

  bench(
    'ssr request loop (vue)',
    () => runSsrRequestLoop(handler, { seed: benchmarkSeed }),
    {
      warmupIterations: 100,
      time: 10_000,
      setup,
      teardown,
      throws: true,
    },
  )
})
