import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, retainSearchParams } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup(middleware = false) {
  const root = new BaseRootRoute({
    ...(middleware
      ? { search: { middlewares: [retainSearchParams(true)] } }
      : {}),
  })
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const item = new BaseRoute({ getParentRoute: () => root, path: '/items/$id' })
  const optional = new BaseRoute({
    getParentRoute: () => root,
    path: '/optional/{-$id}',
  })
  return createTestRouter({
    routeTree: root.addChildren([index, item, optional]),
    history: createMemoryHistory({ initialEntries: ['/items/1'] }),
  })
}

const batchSize = 100
const plain = setup()
const middleware = setup(true)
await plain.load()
await middleware.load()
const locations = ['1', '2'].map((id) =>
  plain.buildLocation({
    to: '/items/$id',
    params: { id },
    search: { tab: id },
  }),
)
const literal = {
  to: '/items/$id',
  params: { id: '9' },
  search: { tab: 'specs', page: 2 },
}
const inherited = { to: '/items/$id', params: {} }
const optional = { to: '/optional/{-$id}', params: {} }

// These inputs intentionally work on the parent commit, where the private slot
// is ignored, so the same fixture measures the ordinary build and its cache.
for (const [name, router, options, useCache] of [
  ['uncached literal', plain, literal, false],
  ['cached literal', plain, literal, true],
  ['uncached inherited', plain, inherited, false],
  ['cache miss inherited', plain, inherited, true],
  ['cache miss optional', plain, optional, true],
  ['uncached middleware', middleware, literal, false],
  ['cached middleware', middleware, literal, true],
] as const) {
  const cache = {}
  const inputs = locations.map((location) => ({
    ...options,
    _fromLocation: location,
    ...(useCache ? { _buildCache: cache } : {}),
  }))
  for (const input of inputs) {
    const { _buildCache: _, ...fresh } = input as any
    expect(router.buildLocation(input as any)).toEqual(
      router.buildLocation(fresh),
    )
  }
  describe(name, () => {
    bench(
      '100 alternating builds',
      () => {
        for (let i = 0; i < batchSize; i++) {
          router.buildLocation(inputs[i % 2]! as any)
        }
      },
      { time: 1_000, warmupTime: 300 },
    )
  })
}

const mixed = [literal, literal, inherited, optional].map((options) => ({
  ...options,
  _buildCache: {},
}))
for (const [name, cold] of [
  ['mixed warm slots', false],
  ['cold literal slots', true],
] as const) {
  for (const options of mixed) {
    const { _buildCache: _, ...fresh } = options
    expect(plain.buildLocation(options as any)).toEqual(
      plain.buildLocation(fresh as any),
    )
  }
  describe(name, () => {
    bench(
      '100 alternating builds',
      () => {
        for (let i = 0; i < batchSize; i++) {
          const options = cold
            ? { ...literal, _buildCache: {} }
            : mixed[i % mixed.length]!
          plain.buildLocation({
            ...options,
            _fromLocation: locations[i % 2],
          } as any)
        }
      },
      { time: 1_000, warmupTime: 300 },
    )
  })
}
