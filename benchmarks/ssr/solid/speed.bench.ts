import { afterAll, beforeAll, bench, describe } from 'vitest'
import { runSsrRequestLoop } from '../bench-utils'
import type { StartRequestHandler } from '../bench-utils'

const appModulePath = './dist/server/server.js'
const benchmarkSeed = 0xcafebabe

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
  beforeAll(setup)
  afterAll(teardown)

  bench(
    'ssr request loop (solid)',
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
