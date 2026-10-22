import { test } from 'vitest'
import {
  assertControlFlowSanity,
  controlFlowBenchOptions,
  runUnmatchedLoop,
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
  await bench('ssr control-flow unmatched 404 (solid)', async () =>
    runUnmatchedLoop(handler),
  ).run(controlFlowBenchOptions)
})
