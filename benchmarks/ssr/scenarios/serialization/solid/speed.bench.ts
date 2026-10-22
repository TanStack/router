import { test } from 'vitest'
import {
  assertSerializationScenario,
  runRichSerializationLoop,
  serializationBenchOptions,
} from '../shared-bench'
import type { StartRequestHandler } from '../shared-bench'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertSerializationScenario(handler)

test('ssr', async ({ bench }) => {
  await bench('ssr dehydrate rich types (solid)', async () =>
    runRichSerializationLoop(handler),
  ).run(serializationBenchOptions)
})
