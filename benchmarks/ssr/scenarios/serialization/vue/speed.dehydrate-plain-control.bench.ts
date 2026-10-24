import { test } from 'vitest'
import {
  assertSerializationScenario,
  runPlainSerializationLoop,
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
  await bench('ssr dehydrate plain control (vue)', async () =>
    runPlainSerializationLoop(handler),
  ).run(serializationBenchOptions)
})
