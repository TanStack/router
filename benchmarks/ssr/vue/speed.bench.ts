import { bench, describe } from 'vitest'
import { runSsrRequestLoop } from '../bench-utils'
import type { StartRequestHandler } from '../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0xdeadbeef

let handler: StartRequestHandler | undefined
let handlerPromise: Promise<StartRequestHandler> | undefined

async function loadHandler() {
  if (!handlerPromise) {
    handlerPromise = import(/* @vite-ignore */ appModuleUrl).then((module) => {
      return (module as { default: StartRequestHandler }).default
    })
  }

  handler = await handlerPromise
  return handler
}

async function setup() {
  await loadHandler()
}

function teardown() {
  handler = undefined
}

async function runBenchmark() {
  // CodSpeed calls the benchmark body directly and bypasses tinybench setup.
  const currentHandler = handler ?? (await loadHandler())
  await runSsrRequestLoop(currentHandler, { seed: benchmarkSeed })
}

describe('ssr', () => {
  bench(
    'ssr request loop (vue)',
    runBenchmark,
    {
      warmupIterations: 100,
      time: 10_000,
      setup,
      teardown,
      throws: true,
    },
  )
})
