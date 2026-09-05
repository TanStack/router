import { bench, describe, expect } from 'vitest'
import {
  compileDecodeCharMap,
  createPathInterpolator,
  interpolatePath,
} from '../src/path'

type Options = Parameters<ReturnType<typeof createPathInterpolator>>[0]

const scenarios: Array<{ name: string; inputs: Array<Options> }> = [
  {
    name: 'single-param shared hits',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/items/$id',
      params: { id: `item ${Math.floor(index / 5)}`, unrelated: index },
    })),
  },
  {
    name: 'multi-param shared hits',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/orgs/$orgId/items/$id',
      params: {
        orgId: `org:${Math.floor(index / 5) % 4}`,
        id: `item/${Math.floor(index / 5)}`,
      },
    })),
  },
  {
    name: 'result eviction',
    inputs: Array.from({ length: 256 }, (_, index) => ({
      path: '/items/$id',
      params: { id: `item ${index}` },
    })),
  },
  {
    name: 'template eviction',
    inputs: Array.from({ length: 64 }, (_, index) => ({
      path: `/section-${index}/$id`,
      params: { id: 'item one' },
    })),
  },
  {
    name: 'mixed optional and splat params',
    inputs: Array.from({ length: 200 }, (_, index) => {
      switch (index % 5) {
        case 0:
          return { path: '/posts/{-$category}', params: {} }
        case 1:
          return {
            path: '/posts/{-$category}',
            params: { category: `news-${index % 10}` },
          }
        case 2:
          return { path: '/users/$id', params: { id: index } }
        case 3:
          return { path: '/files/$', params: { _splat: `docs/${index % 20}` } }
        default:
          return { path: '/about', params: {} }
      }
    }),
  },
]

const decoder = compileDecodeCharMap(['@', '+'])
for (const { inputs } of scenarios) {
  for (const input of inputs) {
    input.decoder = decoder
    input.server = false
  }
}
scenarios.push(
  ...scenarios.map(({ name, inputs }) => ({
    name: `server ${name}`,
    inputs: inputs.map((input) => ({ ...input, server: true })),
  })),
)

describe.each(scenarios)('$name', ({ inputs }) => {
  const interpolate = createPathInterpolator()
  let checksum = 0
  const expected = inputs.reduce((sum, input) => {
    const result = interpolatePath(input).interpolatedPath
    expect(interpolate(input)).toBe(result)
    return sum + result.length
  }, 0)
  for (const input of inputs) {
    expect(interpolate(input)).toBe(interpolatePath(input).interpolatedPath)
  }

  bench(
    'shared interpolation batch',
    () => {
      let length = 0
      for (const input of inputs) {
        length += interpolate(input).length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )

  bench(
    'uncached interpolation batch',
    () => {
      let length = 0
      for (const input of inputs) {
        length += interpolatePath(input).interpolatedPath.length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(expected)
      },
    },
  )
})
