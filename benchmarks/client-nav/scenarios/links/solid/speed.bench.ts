import { bench, describe } from 'vitest'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

describe('client-links', () => {
  const test = setup()

  bench(
    'client-links navigation loop (solid)',
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
