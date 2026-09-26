import { bench, describe } from 'vitest'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

describe('client-preload', () => {
  const test = setup()

  bench(
    'client-preload interaction loop (vue)',
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await test.tick()
      }
      await test.finishBatch()
    },
    {
      ...benchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
