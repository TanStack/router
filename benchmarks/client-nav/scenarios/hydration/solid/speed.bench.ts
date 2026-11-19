import { test } from 'vitest'
import { setup } from './setup'

// TODO(solid-router-v2): port this harness to Solid 2 hydration; it hangs on Solid 1's bootstrap protocol.
test.skip('client-hydration', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'hydrate restored route state and mixed Links (solid)',
    { beforeEach: scenario.before, afterEach: scenario.after },
    async () => {
      await scenario.run()
    },
  ).run({
    time: 5000,
    warmupTime: 1000,
    warmupIterations: 20,
    throws: true,
  })
})
