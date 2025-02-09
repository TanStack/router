import { describe, expect, it } from 'vitest'
import { detectCodeSplitGroupingsFromRoute } from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import type { CodeSplitGroupings } from '../src/core/constants'

const successCases: Array<{
  name: string
  code: string
  expectedGrouping: CodeSplitGroupings | undefined
  expectedRouteId: string
}> = [
  {
    name: 'defaults',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
codeSplitGroupings: [
  ['component'],
  ['pendingComponent'],
  ['errorComponent'],
  ['notFoundComponent']
]
})
`,
    expectedGrouping: defaultCodeSplitGroupings,
    expectedRouteId: '/posts',
  },
  {
    name: 'loader-separate-components-combined',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
codeSplitGroupings: [
  ['loader'],
  ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent']
]
})
`,
    expectedGrouping: [
      ['loader'],
      ['component', 'pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
    expectedRouteId: '/posts',
  },
  {
    name: 'limited-loader-and-component',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({
codeSplitGroupings: [
  ['loader', 'component'],
  ['pendingComponent', 'errorComponent', 'notFoundComponent']
]
})
`,
    expectedGrouping: [
      ['loader', 'component'],
      ['pendingComponent', 'errorComponent', 'notFoundComponent'],
    ],
    expectedRouteId: '/posts',
  },
  {
    name: 'empty',
    code: `
import {createFileRoute} from '@tanstack/react-router'
export const Route = createFileRoute('/posts')({})
`,
    expectedGrouping: undefined,
    expectedRouteId: '/posts',
  },
]

describe('detectCodeSplitGroupingsFromRoute - success', () => {
  it.each(successCases)(
    'should detect code split groupings for $name',
    ({ code, expectedGrouping, expectedRouteId }) => {
      const result = detectCodeSplitGroupingsFromRoute({
        code: code,
        filename: 'test.ts',
        root: '/src',
      })

      expect(result.groupings).toEqual(expectedGrouping)
      expect(result.routeId).toEqual(expectedRouteId)
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

describe('detectCodeSplitGroupingsFromRoute - fail', () => {
  it.each(failCases)('should throw error for $name', ({ code }) => {
    expect(() =>
      detectCodeSplitGroupingsFromRoute({
        code: code,
        filename: 'test.ts',
        root: '/src',
      }),
    ).toThrowError()
  })
})
