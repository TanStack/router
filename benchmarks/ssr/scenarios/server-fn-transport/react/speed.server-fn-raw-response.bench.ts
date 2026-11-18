import { test } from 'vitest'
import {
  assertServerFnTransportScenario,
  runServerFnRawResponseRequestLoop,
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
  await bench('ssr server-fn raw-response (react)', async () =>
    runServerFnRawResponseRequestLoop(handler, context),
  ).run(serverFnTransportBenchOptions)
})
