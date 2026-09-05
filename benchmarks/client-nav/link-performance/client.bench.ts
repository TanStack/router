import { afterEach, beforeEach, bench, describe } from 'vitest'
import { createScenarioSetup } from '../scenarios/harness'
import { benchOptions, ticksPerIteration } from '../scenarios/links/shared'
import {
  LINK_CASES,
  NAVIGATION_STATES,
  assertScenario,
  getSourceUrl,
} from './cases'
import type * as App from './src/client'

const appModulePath = './dist/client/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error('Link client benchmarks must use the production client build')
}

for (const { id, label } of LINK_CASES) {
  describe(label, () => {
    let mounted: ReturnType<typeof app.mountTestApp> | undefined
    const test = createScenarioSetup({
      frameworkLabel: 'React',
      mount: (container, history) => {
        mounted = app.mountTestApp(container, history, id)
        return mounted
      },
      initialUrl: getSourceUrl(id, 0),
      steps: NAVIGATION_STATES.map((state) => `go-state-${state}`),
      assertAfterStep: (index, container) => {
        assertScenario(id, NAVIGATION_STATES[index]!, container)
        if (!mounted) {
          throw new Error('Link benchmark app was not mounted')
        }
        mounted.assertStateUpdates()
      },
    })

    beforeEach(test.before)
    afterEach(test.after)

    bench(
      `client Links: ${id}`,
      async () => {
        for (let index = 0; index < ticksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
      },
      {
        ...benchOptions,
        time: 3_000,
        setup: test.before,
        teardown: test.after,
      },
    )
  })
}
