import { test } from 'vitest'
import {
  assertGlobalMiddlewareScenario,
  globalMiddlewareBenchOptions,
  runGlobalMiddlewareServerRouteLoop,
  setupGlobalMiddlewareBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}
const context = await setupGlobalMiddlewareBench(handler)

await assertGlobalMiddlewareScenario(handler, context)

test('ssr', async ({ bench }) => {
  await bench('ssr global-mw server-route 3 middlewares (vue)', async () =>
    runGlobalMiddlewareServerRouteLoop(handler, 3),
  ).run(globalMiddlewareBenchOptions)
})
