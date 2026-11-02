import { describe, expect, it } from 'vitest'
import { splitGroupingsSchema } from '../src/core/config'
import { defaultCodeSplitGroupings } from '../src/core/constants'

describe('splitGroupingsSchema', () => {
  it.each([
    { name: 'no groups', input: [] },
    { name: 'an empty group', input: [[]] },
    {
      name: 'empty groups between nodes',
      input: [[], ['loader'], [], ['component'], []],
    },
    { name: 'default groups', input: defaultCodeSplitGroupings },
    {
      name: 'all nodes in one group',
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
    {
      name: 'separate loader and component groups',
      input: [['loader'], ['component', 'pendingComponent']],
    },
  ])('preserves $name without mutating the input', ({ input }) => {
    const original = structuredClone(input)
    const result = splitGroupingsSchema.parse(input)

    expect(result).toEqual(original)
    expect(input).toEqual(original)
    expect(result).not.toBe(input)
    for (let index = 0; index < result.length; index++) {
      expect(result[index]).not.toBe(input[index])
    }
  })

  it.each([
    { name: 'within a group', input: [['component', 'component']] },
    {
      name: 'across groups',
      input: [['component'], ['component', 'loader']],
    },
    {
      name: 'after every valid node',
      input: [
        [
          'loader',
          'component',
          'pendingComponent',
          'errorComponent',
          'notFoundComponent',
        ],
        [],
        ['loader'],
      ],
    },
    {
      name: 'multiple times',
      input: [
        ['component', 'component'],
        ['loader', 'loader'],
      ],
    },
  ])('rejects duplicate nodes $name', ({ input }) => {
    const result = splitGroupingsSchema.safeParse(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual([
        {
          code: 'custom',
          path: [],
          message: expect.stringContaining('Split groupings must be unique'),
        },
      ])
      expect(result.error.issues[0]?.message).toContain(JSON.stringify(input))
    }
  })

  it.each([
    { name: 'an unknown node', input: [['unknown']], path: [0, 0] },
    { name: 'a non-string node', input: [[1]], path: [0, 0] },
    { name: 'a missing inner array', input: ['component'], path: [0] },
    { name: 'a missing outer array', input: 'component', path: [] },
  ])('reports the invalid location for $name', ({ input, path }) => {
    const result = splitGroupingsSchema.safeParse(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual([expect.objectContaining({ path })])
    }
  })
})
