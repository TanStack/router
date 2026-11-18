import { test } from 'vitest'
import { setup } from './setup'

test('client-hydration', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'hydrate restored route state and mixed Links (react)',
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
