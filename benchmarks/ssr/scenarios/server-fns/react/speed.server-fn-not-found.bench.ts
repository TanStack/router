import { test } from 'vitest'
import {
  assertServerFnScenario,
  runServerFnNotFoundRequestLoop,
  serverFnBenchOptions,
  setupServerFnBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnBench(handler)

await assertServerFnScenario(handler, context)

test('ssr', async ({ bench }) => {
  await bench('ssr server-fn not-found (react)', async () =>
    runServerFnNotFoundRequestLoop(handler, context),
  ).run(serverFnBenchOptions)
})
