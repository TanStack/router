import { test } from 'vitest'
import { benchLifecycle } from '../../cpu-simulation'
import { LINK_CASES } from './cases'
import { createClientScenario, samplingOptions } from './scenario'
import type * as App from './src/client'

const appModulePath = './dist/client/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error('Link client benchmarks must use the production client build')
}

for (const { id, label } of LINK_CASES) {
  test(label, async ({ bench }) => {
    const scenario = createClientScenario(app, id)
    function finish() {
      try {
        scenario.check()
      } finally {
        scenario.teardown()
      }
    }

    await bench(
      `client Links: ${id}`,
      benchLifecycle({ before: scenario.setup, after: finish }),
      scenario.batch,
    ).run(samplingOptions)
  })
}
