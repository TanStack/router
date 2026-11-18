import { test } from 'vitest'
import { benchLifecycle } from '../../cpu-simulation'
import { LINK_CASES } from './cases'
import { createSsrScenario, samplingOptions } from './scenario'
import type * as App from './src/ssr'

const appUrl = new URL('./dist/ssr/app.js', import.meta.url).href
const app: typeof App = await import(/* @vite-ignore */ appUrl)
if (app.serverEnvironment !== true) {
  throw new Error('Link SSR benchmarks must use the production server build')
}

for (const { id, label } of LINK_CASES) {
  test(label, async ({ bench }) => {
    const scenario = createSsrScenario(app, id)
    function finish() {
      try {
        scenario.check()
      } finally {
        scenario.teardown()
      }
    }

    await bench(
      `SSR Links: ${id}`,
      benchLifecycle({ before: scenario.setup, after: finish }),
      scenario.batch,
    ).run(samplingOptions)
  })
}
