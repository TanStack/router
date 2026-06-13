import { describe } from 'vitest'
import { registerServerMemoryBenches } from '#memory-server/runner'
import { setup } from './setup'

const test = await setup()
await test.sanity()

describe('memory', () => {
  registerServerMemoryBenches(test)
})
