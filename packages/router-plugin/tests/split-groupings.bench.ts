import { bench, describe, expect } from 'vitest'
import { splitGroupingsSchema } from '../src/core/config'
import { defaultCodeSplitGroupings } from '../src/core/constants'

// Cloning a compiled schema creates an uncompiled schema with the same checks.
const uncompiledSchema = splitGroupingsSchema.clone()

describe.each([
  { name: 'single node', input: [['component']] },
  { name: 'default groups', input: defaultCodeSplitGroupings },
  {
    name: 'all nodes',
    input: [
      [
        'loader',
        'component',
        'pendingComponent',
        'errorComponent',
        'notFoundComponent',
      ],
    ],
  },
  { name: 'duplicate node', input: [['component'], ['component', 'loader']] },
  { name: 'unknown node', input: [['unknown']] },
])('split groupings: $name', ({ input }) => {
  const expected = uncompiledSchema.safeParse(input)
  const actual = splitGroupingsSchema.safeParse(input)
  expect(actual.success).toBe(expected.success)
  if (actual.success && expected.success) {
    expect(actual.data).toEqual(expected.data)
  } else if (!actual.success && !expected.success) {
    expect(actual.error.issues).toEqual(expected.error.issues)
  }

  bench('uncompiled', () => {
    uncompiledSchema.safeParse(input)
  })
  bench('compiled', () => {
    splitGroupingsSchema.safeParse(input)
  })
})
