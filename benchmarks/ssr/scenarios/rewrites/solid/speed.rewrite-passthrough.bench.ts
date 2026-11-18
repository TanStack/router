import { test } from 'vitest'
import {
  assertRewriteScenario,
  rewriteBenchOptions,
  runRewritePassthroughLoop,
} from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertRewriteScenario(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr rewrite passthrough (solid)', async () =>
    runRewritePassthroughLoop(handler),
  ).run(rewriteBenchOptions)
})
