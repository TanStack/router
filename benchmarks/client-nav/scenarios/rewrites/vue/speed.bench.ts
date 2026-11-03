import { test } from 'vitest'
import { benchLifecycle } from '../../../../cpu-simulation'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

test('client-rewrites', async ({ bench }) => {
  const scenario = setup()

  await bench(
    'client-rewrites navigation loop (vue)',
    benchLifecycle(scenario),
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await scenario.tick()
      }
      await scenario.finishBatch()
    },
  ).run(benchOptions)
})
