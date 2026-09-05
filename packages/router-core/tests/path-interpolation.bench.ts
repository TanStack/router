import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute } from '../src'
import {
  compileDecodeCharMap,
  interpolatePath,
  interpolatePathname,
} from '../src/path'
import { createTestRouter } from './routerTestUtils'

type Options = Parameters<typeof interpolatePath>[0]

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
  {
    name: 'missing required and splat params',
    inputs: Array.from({ length: 200 }, (_, index) => {
      switch (index % 5) {
        case 0:
          return { path: '/$first/$second', params: { second: 'two' } }
        case 1:
          return {
            path: '/$first/$second',
            params: { first: undefined, second: 'two' },
          }
        case 2:
          return { path: '/$first/{-$second}', params: {} }
        case 3:
          return { path: '/files/$', params: {} }
        default:
          return { path: '/files/prefix{$}suffix', params: { _splat: '' } }
      }
    }),
  },
  {
    name: 'affixed mixed segments',
    inputs: Array.from({ length: 200 }, (_, index) => ({
      path: '/root/prefix{$id}suffix/{-$language}/files/{$}.txt',
      params: {
        id: `item ${index % 40}`,
        language: index % 2 ? 'en' : undefined,
        _splat: index % 3 ? `docs/file ${index % 20}` : '',
      },
    })),
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
  const router = createTestRouter({
    routeTree: new BaseRootRoute({}),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: inputs[0]?.server,
    scrollRestoration: false,
  })
  router.pathParamsDecoder = decoder
  router.history.destroy()
  const interpolate = router['interpolatePath']
  const calls = inputs
    .filter((input) => input.path?.includes('$'))
    .map((input) => ({
      args:
        interpolate.length === 1 ? [input] : [input.path || '/', input.params],
      expected: interpolatePath(input).interpolatedPath,
    }))
  let checksum = 0
  const expected = inputs.reduce(
    (sum, input) => sum + interpolatePath(input).interpolatedPath.length,
    0,
  )
  const cachedExpected = calls.reduce((sum, call) => {
    expect(Reflect.apply(interpolate, router, call.args)).toBe(call.expected)
    return sum + call.expected.length
  }, 0)
  for (const call of calls) {
    expect(Reflect.apply(interpolate, router, call.args)).toBe(call.expected)
  }

  bench(
    'shared interpolation batch',
    () => {
      let length = 0
      for (const call of calls) {
        length += Reflect.apply(interpolate, router, call.args).length
      }
      checksum = length
    },
    {
      time: 1500,
      warmupTime: 500,
      throws: true,
      teardown: () => {
        expect(checksum).toBe(cachedExpected)
      },
    },
  )

  bench(
    'pathname-only interpolation batch',
    () => {
      let length = 0
      for (const input of inputs) {
        length += interpolatePathname(
          input.path || '/',
          input.params,
          input.decoder,
          undefined,
          undefined,
          input.server,
        ).length
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
