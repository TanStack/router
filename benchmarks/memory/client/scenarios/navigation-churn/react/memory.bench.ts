import { describe } from 'vitest'
import { registerClientMemoryBench } from '#memory-client/runner'
import { setup } from './setup'

await setup().sanity()

describe('memory', () => {
  registerClientMemoryBench(setup())
})
