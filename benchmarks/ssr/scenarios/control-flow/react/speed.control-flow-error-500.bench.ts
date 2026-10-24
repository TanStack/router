import { test } from 'vitest'
import {
  assertControlFlowSanity,
  controlFlowBenchOptions,
  runErrorLoop,
} from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertControlFlowSanity(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr control-flow error 500 (react)', async () =>
    runErrorLoop(handler),
  ).run(controlFlowBenchOptions)
})
