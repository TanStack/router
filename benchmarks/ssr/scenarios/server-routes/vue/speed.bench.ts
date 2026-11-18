import { test } from 'vitest'
import {
  assertServerRouteResponse,
  runServerRouteLoop,
  serverRouteBenchOptions,
} from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertServerRouteResponse(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr server-route (vue)', async () =>
    runServerRouteLoop(handler),
  ).run(serverRouteBenchOptions)
})
