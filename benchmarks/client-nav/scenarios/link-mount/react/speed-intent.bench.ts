import { test } from 'vitest'
import { benchLifecycle } from '../../../../cpu-simulation'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

// Separate file, so its worker's JIT feedback never mixes the two router
// configurations.
test('client-link-mount-intent', async ({ bench }) => {
  const scenario = setup('intent')

  await bench(
    'client-link-mount intent loop (react)',
    benchLifecycle(scenario),
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await scenario.tick()
      }
      await scenario.finishBatch()
    },
  ).run(benchOptions)
})
