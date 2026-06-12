import { bench, describe } from 'vitest'
import { memoryBenchOptions } from '../../../bench-utils'
import { setup } from './setup'

const mountUnmountIterations = 100

await setup().sanity()

describe('memory', () => {
  const test = setup()

  bench(
    'mem mount-unmount (react)',
    async () => {
      for (let index = 0; index < mountUnmountIterations; index++) {
        await test.cycle()
      }
    },
    memoryBenchOptions,
  )
})
