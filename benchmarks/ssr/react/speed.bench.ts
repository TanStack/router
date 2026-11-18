import { test } from 'vitest'
import { runSsrRequestLoop } from '../bench-utils'
import type { StartRequestHandler } from '../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0xdecafbad

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

test('ssr', async ({ bench }) => {
  await bench('ssr request loop (react)', async () =>
    runSsrRequestLoop(handler, { seed: benchmarkSeed }),
  ).run({
    warmupIterations: 100,
    time: 10_000,
    throws: true,
  })
})
