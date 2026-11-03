import { test } from 'vitest'
import { benchLifecycle } from '../../../../cpu-simulation'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

test('client-preload', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'client-preload interaction loop (react)',
    benchLifecycle(scenario),
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await scenario.tick()
      }
      await scenario.finishBatch()
    },
  ).run(benchOptions)
})
