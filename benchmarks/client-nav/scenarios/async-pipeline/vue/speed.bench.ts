import { bench, describe } from 'vitest'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

describe('client-async-pipeline', () => {
  const test = setup()

  bench(
    'client-async-pipeline navigation loop (vue)',
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
