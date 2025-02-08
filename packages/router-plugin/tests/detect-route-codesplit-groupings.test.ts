import { describe, expect, it } from 'vitest'
import { detectCodeSplitGroupingsFromRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import type { CodeSplitGroupings } from '../src/core/constants'

const successCases: Array<{
  name: string
  expected: CodeSplitGroupings | undefined
  code: string
}> = [
  {
    name: 'defaults',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/')({
codeSplitGroupings: [
  ['component'],
  ['pendingComponent'],
  ['errorComponent'],
  ['notFoundComponent']
]
})
`,
    expected: defaultCodeSplitGroupings,
  },
  {
    name: 'loader-separate-components-combined',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/')({
codeSplitGroupings: [
  ['loader'],
  ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent']
]
})
`,
    expected: [
      ['loader'],
      ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
  },
  {
    name: 'limited-loader-and-component',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/')({
codeSplitGroupings: [
  ['loader', 'component'],
  ['pendingComponent', 'errorComponent', 'notFoundComponent']
]
})
`,
    expected: [
      ['loader', 'component'],
      ['pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
  },
  {
    name: 'empty',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
`,
    expected: undefined,
  },
]

describe('detectCodeSplitGroupingsFromRoute - success', () => {
  it.each(successCases)(
    'should detect code split groupings for $name',
    ({ code, expected }) => {
      const result = detectCodeSplitGroupingsFromRoute({
        code: code,
        filename: 'test.ts',
        root: '/src',
      })

      expect(result).toEqual(expected)
    },
  )
})

const failCases: Array<{
  name: string
  code: string
}> = [
  {
    name: 'not-nested-array',
    code: `
  import {createFileRoute} from '@tanstack/react-router'
  export const Route = createFileRoute('/')({
  codeSplitGroupings: [
      'loader',
  ]
  })
  `,
  },
  {
    name: 'reference-variable',
    code: `
import {createFileRoute} from '@tanstack/react-router'
const groupings = [
  ['loader'],
  ['component'],
]
export const Route = createFileRoute('/')({
codeSplitGroupings: groupings
})
`,
  },
]
