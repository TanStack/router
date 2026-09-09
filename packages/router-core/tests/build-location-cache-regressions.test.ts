import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, retainSearchParams } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup(stringify = false) {
  const root = new BaseRootRoute({})
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const item = new BaseRoute({ getParentRoute: () => root, path: '/items/$id' })
  const optional = new BaseRoute({
    getParentRoute: () => root,
    path: '/optional/{-$id}',
    ...(stringify
      ? {
          params: {
            stringify: (p: any) => ({ id: p.id ? `s${p.id}` : 'fallback' }),
          },
        }
      : {}),
  })
  const router = createTestRouter({
    routeTree: root.addChildren([index, item, optional]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return { router, optional, item }
}

test('an initially absent optional param can become inherited', async () => {
  const { router } = setup()
  await router.load()
  const cache = {}
  const opts = { to: '/optional/{-$id}', params: {} }
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(
    '/optional',
  )
  await router.navigate({ to: '/items/$id', params: { id: '2' } })
  const fresh = router.buildLocation(opts).href
  expect(fresh).toBe('/optional/2')
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(fresh)
})

test('a stringify skipped for empty params must be reconsidered', async () => {
  const { router } = setup(true)
  await router.load()
  const cache = {}
  const opts = { to: '/optional/{-$id}', params: {} }
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(
    '/optional',
  )
  await router.navigate({ to: '/items/$id', params: { id: '2' } })
  const fresh = router.buildLocation(opts).href
  expect(fresh).toBe('/optional/s2')
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(fresh)
})

test('route.update invalidates newly installed search middleware', async () => {
  const { router, item } = setup()
  await router.load()
  const cache = {}
  const opts = { to: '/items/$id', params: { id: 'fixed' } }
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(
    '/items/fixed',
  )
  item.update({ search: { middlewares: [retainSearchParams(true)] } })
  await router.navigate({ to: '/', search: { tab: 'new' } } as any)
  const fresh = router.buildLocation(opts).href
  expect(fresh).toBe('/items/fixed?tab=new')
  expect(router.buildLocation({ ...opts, _buildCache: cache }).href).toBe(fresh)
})

test('output rewrites observe a changed locale with stable router options', async () => {
  const { router } = setup()
  let locale = 'en'
  router.update({
    rewrite: {
      input: ({ url }) => {
        url.pathname = url.pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/'
        return url
      },
      output: ({ url }) => {
        url.pathname = `/${locale}${url.pathname}`
        return url
      },
    },
  })
  await router.load()
  const cache = {}
  const opts = { to: '/items/$id', params: { id: '9' } }
  expect(router.buildLocation({ ...opts, _buildCache: cache }).publicHref).toBe(
    '/en/items/9',
  )
  locale = 'fr'
  await router.navigate({ to: '/items/$id', params: { id: '2' } })
  const fresh = router.buildLocation(opts).publicHref
  expect(fresh).toBe('/fr/items/9')
  expect(router.buildLocation({ ...opts, _buildCache: cache }).publicHref).toBe(
    fresh,
  )
})

test.each([
  ['prototype property', () => Object.create({ id: '1' })],
  [
    'non-enumerable property',
    () => Object.defineProperty({}, 'id', { value: '1' }),
  ],
])('params with a %s still inherit the current value', async (_, params) => {
  const { router } = setup()
  await router.load()
  await router.navigate({ to: '/items/$id', params: { id: '1' } })
  const options = { to: '/items/$id', params: params() }
  const cache = {}
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/1',
  )
  await router.navigate({ to: '/items/$id', params: { id: '2' } })
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/2',
  )
})

test('cache hits still invoke a custom search serializer', async () => {
  const { router } = setup()
  let locale = 'en'
  router.update({ stringifySearch: () => `?locale=${locale}` })
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params: { id: '9' } }
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/9?locale=en',
  )
  const entry = cache.value
  expect(entry).toBeDefined()
  locale = 'fr'
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/9?locale=fr',
  )
  expect(cache.value).toBe(entry)
})

test('a newly installed params stringifier invalidates a cache hit', async () => {
  const { router, item } = setup()
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params: { id: '9' } }
  router.buildLocation({ ...options, _buildCache: cache })
  expect(cache.value).toBeDefined()
  item.options.params = { stringify: (params) => ({ id: `x${params.id}` }) }
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/x9',
  )
  const nextEntry = cache.value
  expect(nextEntry).toBeDefined()
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/x9',
  )
  expect(cache.value).toBe(nextEntry)
})

test('a link cache cannot bypass navigation validation or template matching', async () => {
  const { router, item } = setup()
  item.update({
    validateSearch: (search: Record<string, unknown>) => ({
      page: search.page ?? 1,
    }),
  } as any)
  await router.load()
  const options = { to: '/items/$id', params: { id: '9' } }
  const cache: import('../src').BuildLocationCache = {}
  expect(router.buildLocation({ ...options, _buildCache: cache }).href).toBe(
    '/items/9',
  )
  expect(cache.value).toBeDefined()
  expect(
    router.buildLocation({
      ...options,
      _buildCache: cache,
      _includeValidateSearch: true,
    }).href,
  ).toBe('/items/9?page=1')
  expect(
    router.buildLocation({ ...options, _buildCache: cache, leaveParams: true })
      .pathname,
  ).toBe('/items/$id')
})

test('cache hits build fresh state and continue applying state updaters', async () => {
  const { router } = setup()
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = {
    to: '/items/$id',
    params: { id: '9' },
    state: (previous: any): any => ({ count: (previous.count ?? 0) + 1 }),
  }
  const first = router.buildLocation({ ...options, _buildCache: cache })
  const entry = cache.value
  expect(entry).toBeDefined()
  await router.navigate({ to: '/', state: { count: 4 } } as any)
  const second = router.buildLocation({ ...options, _buildCache: cache })
  expect(second).not.toBe(first)
  expect(second.state).toEqual({ count: 5 })
  expect(cache.value).toBe(entry)
})

test('a frozen params getter is evaluated on each build', async () => {
  const { router } = setup()
  await router.load()
  let id = '1'
  const params = Object.freeze({
    get id() {
      return id
    },
  })
  const cache = {}
  const options = { to: '/items/$id', params, _buildCache: cache }
  expect(router.buildLocation(options).href).toBe('/items/1')
  id = '2'
  expect(router.buildLocation(options).href).toBe('/items/2')
})

test('object-valued params are not assumed to have a constant string representation', async () => {
  const { router } = setup()
  await router.load()
  let id = '1'
  const params = { id: { toString: () => id } }
  const options = { to: '/items/$id', params, _buildCache: {} }
  expect(router.buildLocation(options as any).href).toBe('/items/1')
  id = '2'
  expect(router.buildLocation(options as any).href).toBe('/items/2')
})

test('search accessors and nested accessors are evaluated on pathname cache hits', async () => {
  const { router } = setup()
  await router.load()
  let locale = 'en'
  const search = Object.freeze({
    get locale() {
      return locale
    },
    nested: Object.freeze({
      get locale() {
        return locale
      },
    }),
  })
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params: { id: '9' }, search }
  router.buildLocation({ ...options, _buildCache: cache })
  const entry = cache.value
  expect(entry).toBeDefined()
  locale = 'fr'
  const cached = router.buildLocation({ ...options, _buildCache: cache })
  expect(cached).toEqual(router.buildLocation(options))
  expect(cached.search).toEqual({ locale: 'fr', nested: { locale: 'fr' } })
  expect(cache.value).toBe(entry)
})

test('a mutating serializer does not accumulate mutations in a pathname cache', async () => {
  const { router } = setup()
  router.update({
    stringifySearch: (search) => {
      search.count = (search.count ?? 0) + 1
      return `?count=${search.count}`
    },
  })
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params: { id: '9' } }
  router.buildLocation({ ...options, _buildCache: cache })
  expect(cache.value).toBeDefined()
  expect(router.buildLocation({ ...options, _buildCache: cache })).toEqual(
    router.buildLocation(options),
  )
})

// Cache eligibility follows the effective values, including absent optionals.
test.each([
  [
    'explicit optional',
    { to: '/optional/{-$id}', params: { id: 'fixed' } },
    '/optional/fixed',
  ],
  [
    'explicit undefined optional',
    { to: '/optional/{-$id}', params: { id: undefined } },
    '/optional',
  ],
  [
    'explicit null optional',
    { to: '/optional/{-$id}', params: { id: null } },
    '/optional',
  ],
  ['inherited optional', { to: '/optional/{-$id}' }, '/optional/1'],
  [
    'partially inherited optional',
    { to: '/optional/{-$id}', params: {} },
    '/optional/1',
  ],
  ['params true', { to: '/optional/{-$id}', params: true }, '/optional/1'],
  ['params false', { to: '/optional/{-$id}', params: false }, '/optional'],
  [
    'params updater',
    { to: '/optional/{-$id}', params: (p: any) => ({ id: p.id }) },
    '/optional/1',
  ],
  [
    'relative with from',
    { from: '/items/$id', to: '.', params: { id: 'fixed' } },
    '/items/fixed',
  ],
  ['relative inherited', { to: '.' }, '/items/1'],
  ['concrete pathname', { to: '/items/1' }, '/items/1'],
])(
  '%s hits across search/hash-only navigation',
  async (_, options, pathname) => {
    const { router } = setup()
    await router.load()
    await router.navigate({ to: '/items/$id', params: { id: '1' } })
    const cache: import('../src').BuildLocationCache = {}
    const build = () =>
      router.buildLocation({ ...options, _buildCache: cache } as any)
    expect(build().pathname).toBe(pathname)
    const entry = cache.value
    expect(entry).toBeDefined()
    await router.navigate({
      to: '/items/$id',
      params: { id: '1' },
      search: { page: 2 },
      hash: 'new',
    } as any)
    expect(build()).toEqual(router.buildLocation(options as any))
    expect(cache.value).toBe(entry)
  },
)

test('an absent inherited optional hits until its dependency appears, then hits again', async () => {
  const { router } = setup()
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/optional/{-$id}', params: {}, _buildCache: cache }
  expect(router.buildLocation(options).pathname).toBe('/optional')
  const absent = cache.value
  await router.navigate({ to: '/', search: { page: 2 } } as any)
  expect(router.buildLocation(options).pathname).toBe('/optional')
  expect(cache.value).toBe(absent)
  await router.navigate({ to: '/items/$id', params: { id: '2' } })
  expect(router.buildLocation(options).pathname).toBe('/optional/2')
  expect(cache.value).not.toBe(absent)
  const present = cache.value
  router.buildLocation(options)
  expect(cache.value).toBe(present)
  await router.navigate({ to: '/' })
  expect(router.buildLocation(options).pathname).toBe('/optional')
  expect(cache.value).not.toBe(present)
})

test('a stringifier runs on cache hits and invalidates only when its output changes', async () => {
  const { router, optional } = setup()
  let calls = 0
  let prefix = 'a'
  optional.options.params = {
    stringify: (params: any) => {
      calls++
      return { id: prefix + params.id }
    },
  }
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = {
    to: '/optional/{-$id}',
    params: { id: '1' },
    _buildCache: cache,
  }
  expect(router.buildLocation(options).pathname).toBe('/optional/a1')
  const first = cache.value
  expect(router.buildLocation(options).pathname).toBe('/optional/a1')
  expect(cache.value).toBe(first)
  expect(calls).toBe(2)
  prefix = 'b'
  expect(router.buildLocation(options).pathname).toBe('/optional/b1')
  expect(cache.value).not.toBe(first)
  expect(calls).toBe(3)
})

test.each(['/optional/pre{-$id}suf', '/optional/{-$id}/more/{-$other}'])(
  'optional dependency tracking preserves prefixes, suffixes and multiple params in %s',
  async (path) => {
    const root = new BaseRootRoute({})
    const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const route = new BaseRoute({ getParentRoute: () => root, path })
    const router = createTestRouter({
      routeTree: root.addChildren([index, route]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    const cache: import('../src').BuildLocationCache = {}
    for (const params of [
      {},
      { id: 'a', other: 'b' },
      { id: undefined, other: 'b' },
      { id: 'a', other: undefined },
      {},
    ]) {
      const options = { to: path, params }
      expect(
        router.buildLocation({ ...options, _buildCache: cache } as any),
      ).toEqual(router.buildLocation(options as any))
      const entry = cache.value
      expect(
        router.buildLocation({ ...options, _buildCache: cache } as any),
      ).toEqual(router.buildLocation(options as any))
      expect(cache.value).toBe(entry)
    }
  },
)

test('a frozen non-path getter still runs before URL rewriting on late hits', async () => {
  const { router } = setup()
  let locale = 'en'
  const params = Object.freeze({
    id: '1',
    get other() {
      locale = locale === 'en' ? 'fr' : 'en'
      return 'unused'
    },
  })
  router.update({
    rewrite: {
      output: ({ url }) => {
        url.pathname = `/${locale}${url.pathname}`
        return url
      },
    },
  })
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params, _buildCache: cache }
  expect(router.buildLocation(options).publicHref).toBe('/fr/items/1')
  const entry = cache.value
  expect(router.buildLocation(options).publicHref).toBe('/en/items/1')
  expect(cache.value).toBe(entry)
})

test('equivalent relative parent destinations hit across sibling source routes', async () => {
  const root = new BaseRootRoute({})
  const parent = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  const a = new BaseRoute({ getParentRoute: () => parent, path: '/a' })
  const b = new BaseRoute({ getParentRoute: () => parent, path: '/b' })
  const router = createTestRouter({
    routeTree: root.addChildren([parent.addChildren([a, b])]),
    history: createMemoryHistory({ initialEntries: ['/items/1/a'] }),
  })
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '..', _buildCache: cache }
  expect(router.buildLocation(options).pathname).toBe('/items/1')
  const entry = cache.value
  await router.navigate({ to: '/items/$id/b', params: { id: '1' } })
  expect(router.buildLocation(options).pathname).toBe('/items/1')
  expect(cache.value).toBe(entry)
})

test('path resolution and interpolation settings are cache dependencies', async () => {
  const { router } = setup()
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  const options = { to: '/items/$id', params: { id: 'a@b' } }
  router.buildLocation({ ...options, _buildCache: cache })
  let entry = cache.value
  router.update({ defaultPendingMs: 42 })
  expect(router.buildLocation({ ...options, _buildCache: cache })).toEqual(
    router.buildLocation(options),
  )
  expect(cache.value).toBe(entry)
  router.update({ trailingSlash: 'always' } as any)
  expect(router.buildLocation({ ...options, _buildCache: cache })).toEqual(
    router.buildLocation(options),
  )
  expect(cache.value).not.toBe(entry)
  entry = cache.value
  router.update({ pathParamsAllowedCharacters: ['@'] })
  expect(router.buildLocation({ ...options, _buildCache: cache })).toEqual(
    router.buildLocation(options),
  )
  expect(cache.value).not.toBe(entry)
})

test('braced splats track _splat with prefixes, suffixes and absent values', async () => {
  const root = new BaseRootRoute({})
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/files/prefix{$}.txt',
  })
  const router = createTestRouter({
    routeTree: root.addChildren([index, route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const cache: import('../src').BuildLocationCache = {}
  for (const _splat of [undefined, 'a/b', 'space here', '', undefined]) {
    const options = { to: '/files/prefix{$}.txt', params: { _splat } }
    expect(router.buildLocation({ ...options, _buildCache: cache })).toEqual(
      router.buildLocation(options),
    )
    const entry = cache.value
    router.buildLocation({ ...options, _buildCache: cache })
    expect(cache.value).toBe(entry)
  }
})
