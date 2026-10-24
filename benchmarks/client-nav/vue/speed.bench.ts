import { test } from 'vitest'
import { setup } from './setup'

test('client-nav', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'client-side navigation loop (vue)',
    { beforeAll: scenario.before, afterAll: scenario.after },
    async () => {
      for (let i = 0; i < 10; i++) {
        await scenario.tick()
      }
    },
  ).run({
    warmupIterations: 100,
    time: 10_000,
  })
})
