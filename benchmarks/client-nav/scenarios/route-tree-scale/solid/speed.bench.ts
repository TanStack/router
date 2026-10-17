import { test } from 'vitest'
import { benchLifecycle } from '../../../../cpu-simulation'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

test('client-route-tree-scale', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'client-route-tree-scale navigation loop (solid)',
    benchLifecycle(scenario),
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await scenario.tick()
      }
      await scenario.finishBatch()
    },
  ).run(benchOptions)
})
