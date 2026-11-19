import { test } from 'vitest'
import {
  assertServerFnScenario,
  runServerFnGetRequestLoop,
  serverFnBenchOptions,
  setupServerFnBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'
import { solidServerFnBenchAdapter } from './adapter'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnBench(handler, solidServerFnBenchAdapter)

await assertServerFnScenario(handler, context)

test('ssr', async ({ bench }) => {
  await bench('ssr server-fn GET (solid)', async () =>
    runServerFnGetRequestLoop(handler, context),
  ).run(serverFnBenchOptions)
})
