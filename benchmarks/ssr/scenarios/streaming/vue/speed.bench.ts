import { test } from 'vitest'
import {
  assertStreamingSanity,
  benchOptions,
  runStreamingLoop,
  type StartRequestHandler,
} from '../shared-bench'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertStreamingSanity(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr streaming deferred (vue)', async () =>
    runStreamingLoop(handler),
  ).run(benchOptions)
})
