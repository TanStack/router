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
  expect(cache.value).toBeUndefined()
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

test.each(['/items/$*', '/items/$*/$'])(
  'a parameter named star in %s is not mistaken for the splat alias',
  async (path) => {
    const root = new BaseRootRoute({})
    const route = new BaseRoute({ getParentRoute: () => root, path })
    const router = createTestRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/items/1/tail'] }),
    })
    await router.load()
    const options = { to: path, params: { _splat: 'tail' } }
    const cache = {}
    router.buildLocation({ ...options, _buildCache: cache } as any)
    await router.navigate({
      to: path,
      params: { '*': '2', _splat: 'tail' },
    } as any)
    expect(
      router.buildLocation({ ...options, _buildCache: cache } as any),
    ).toEqual(router.buildLocation(options as any))
  },
)
