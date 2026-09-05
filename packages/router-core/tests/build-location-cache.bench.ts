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
  ['changing inherited params', plain, inherited, true],
  ['uncached optional', plain, optional, false],
  ['changing optional params', plain, optional, true],
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
  ['stable mixed slots', false],
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

// Isolate hit rates for destinations the first implementation excluded. These
// locations change search/hash while retaining the path parameter dependency.
const stableLocations = [1, 2].map((page) =>
  plain.buildLocation({
    to: '/items/$id',
    params: { id: '1' },
    search: { page },
    hash: String(page),
  }),
)
const withStringify = setup()
withStringify.routesByPath['/items/$id']!.options.params = {
  stringify: (params: any) => ({ id: String(params.id) }),
}
await withStringify.load()
for (const [name, router, options] of [
  ['optional supplied', plain, { to: '/optional/{-$id}', params: { id: '9' } }],
  [
    'optional absent',
    plain,
    { to: '/optional/{-$id}', params: { id: undefined } },
  ],
  ['optional inherited unchanged', plain, optional],
  ['inherited unchanged', plain, inherited],
  ['relative unchanged', plain, { to: '.' }],
  [
    'updater unchanged',
    plain,
    { to: '/items/$id', params: (params: any) => ({ id: params.id }) },
  ],
  ['stringifier unchanged', withStringify, literal],
  [
    'explicit mask',
    plain,
    { ...literal, mask: { to: '/optional/{-$id}', params: true } },
  ],
] as const) {
  for (const useCache of [false, true]) {
    const cache: { value?: unknown } = {}
    const inputs = stableLocations.map((location) => ({
      ...options,
      _fromLocation: location,
      ...(useCache ? { _buildCache: cache } : {}),
    }))
    // One Link keeps its slot while the current location changes.
    for (const input of inputs) {
      const { _buildCache: _, ...fresh } = input as any
      expect(router.buildLocation(input as any)).toEqual(
        router.buildLocation(fresh),
      )
    }
    // The parent implementation ignores the slot. On implementations that
    // populate it, require real hits across both locations before timing.
    if (cache.value) {
      const entry = cache.value
      for (const input of inputs) {
        router.buildLocation(input as any)
        expect(cache.value).toBe(entry)
      }
    }
    describe(`${name} ${useCache ? 'cached' : 'uncached'}`, () => {
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
}

describe('mixed hits and changing inherited params', () => {
  bench(
    '100 alternating builds',
    () => {
      for (let i = 0; i < batchSize; i++) {
        plain.buildLocation({
          ...mixed[i % mixed.length]!,
          _fromLocation: locations[Math.floor(i / mixed.length) % 2],
        } as any)
      }
    },
    { time: 1_000, warmupTime: 300 },
  )
})

const splatRoot = new BaseRootRoute({})
const splatRouter = createTestRouter({
  routeTree: splatRoot.addChildren([
    new BaseRoute({ getParentRoute: () => splatRoot, path: '/files/$' }),
  ]),
  history: createMemoryHistory({ initialEntries: ['/files/a'] }),
})
await splatRouter.load()
for (const [name, router, options] of [
  ['static pathname', plain, { to: '/' }],
  ['inherited params true', plain, { to: '/items/$id', params: true }],
  [
    'long Unicode splat',
    splatRouter,
    { to: '/files/$', params: { _splat: 'café/a b/@item/'.repeat(16) } },
  ],
] as const) {
  for (const useCache of [false, true]) {
    const optionsWithCache = {
      ...options,
      ...(useCache ? { _buildCache: {} } : {}),
    }
    expect(router.buildLocation(optionsWithCache as any)).toEqual(
      router.buildLocation(options as any),
    )
    describe(`${name} ${useCache ? 'cached' : 'uncached'}`, () => {
      bench(
        '100 repeated builds',
        () => {
          for (let i = 0; i < batchSize; i++) {
            router.buildLocation(optionsWithCache as any)
          }
        },
        { time: 1_000, warmupTime: 300 },
      )
    })
  }
}
