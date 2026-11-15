import { test } from 'vitest'
import {
  assertServerFnTransportScenario,
  runServerFnMultipartRequestLoop,
  serverFnTransportBenchOptions,
  setupServerFnTransportBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'
import { solidServerFnTransportBenchAdapter } from './adapter'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnTransportBench(
  handler,
  solidServerFnTransportBenchAdapter,
)

await assertServerFnTransportScenario(handler, context)

test('ssr', async ({ bench }) => {
  await bench('ssr server-fn multipart (solid)', async () =>
    runServerFnMultipartRequestLoop(handler, context),
  ).run(serverFnTransportBenchOptions)
})
