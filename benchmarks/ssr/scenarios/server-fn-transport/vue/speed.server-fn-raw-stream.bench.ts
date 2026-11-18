import { test } from 'vitest'
import {
  assertServerFnTransportScenario,
  runServerFnRawStreamRequestLoop,
  serverFnTransportBenchOptions,
  setupServerFnTransportBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnTransportBench(handler)

await assertServerFnTransportScenario(handler, context)

test('ssr', async ({ bench }) => {
  await bench('ssr server-fn raw-stream (vue)', async () =>
    runServerFnRawStreamRequestLoop(handler, context),
  ).run(serverFnTransportBenchOptions)
})
