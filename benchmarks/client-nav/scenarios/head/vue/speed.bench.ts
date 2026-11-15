import { test } from 'vitest'
import { benchLifecycle } from '../../../../cpu-simulation'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

test('client-head', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'client-head navigation loop (vue)',
    benchLifecycle(scenario),
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await scenario.tick()
      }
      await scenario.finishBatch()
    },
  ).run(benchOptions)
})
