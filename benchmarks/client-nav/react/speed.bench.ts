import { bench, describe } from 'vitest'
import { setup } from './setup'

describe('client-nav', () => {
  const test = setup()

  bench(
    'client-side navigation loop (react)',
    async () => {
      for (let i = 0; i < 10; i++) {
        await test.tick()
      }
    },
    {
      warmupIterations: 100,
      time: 10_000,
      setup: test.before,
      teardown: test.after,
    },
  )
})
