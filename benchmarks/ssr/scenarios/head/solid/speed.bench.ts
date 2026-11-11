import { test } from 'vitest'
import { assertHeadSanity, headBenchOptions, runHeadLoop } from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertHeadSanity(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr head (solid)', async () => runHeadLoop(handler)).run(
    headBenchOptions,
  )
})
