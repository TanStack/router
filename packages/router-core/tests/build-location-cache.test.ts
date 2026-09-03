import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, retainSearchParams } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouter, BuildLocationCache, ParsedLocation } from '../src'

function makeRouter(initialEntry = '/items/1') {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const itemsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$id',
  })
  const itemsDetailRoute = new BaseRoute({
    getParentRoute: () => itemsRoute,
    path: '/detail',
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })
  const routeTree = rootRoute.addChildren([
    indexRoute,
    itemsRoute.addChildren([itemsDetailRoute]),
    aboutRoute,
  ])

  return createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
}

/**
 * Build `opts` with and without a memo slot and assert the memo did not change
 * the answer. Returns whether the memo actually served its previous object,
 * which happens only when the build never read the current location, so both
 * the fast path and the correctness of the classification are pinned.
 */
function buildBoth(
  router: AnyRouter,
  cache: BuildLocationCache,
  opts: Record<string, unknown>,
) {
  const previous = cache.r
  const cached: ParsedLocation = router.buildLocation({
    ...opts,
    _buildCache: cache,
  } as any)
  const fresh: ParsedLocation = router.buildLocation({ ...opts } as any)

  expect(cached.href).toBe(fresh.href)
  expect(cached.publicHref).toBe(fresh.publicHref)
  expect(cached.pathname).toBe(fresh.pathname)
  expect(cached.searchStr).toBe(fresh.searchStr)
  expect(cached.hash).toBe(fresh.hash)
  expect(cached.search).toEqual(fresh.search)
  expect(cached.state).toEqual(fresh.state)
  expect(cached.maskedLocation?.href).toBe(fresh.maskedLocation?.href)

  return {
    location: cached,
    hit: previous !== undefined && cached === previous,
  }
}

describe('buildLocation memo (_buildCache)', () => {
  test('a location-independent destination is served from the memo across navigations', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id', params: { id: '9' } }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/9')

    await router.navigate({ to: '/items/$id', params: { id: '2' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(true)
    expect(second.location.href).toBe('/items/9')

    await router.navigate({ to: '/about' })
    const third = buildBoth(router, cache, opts)
    expect(third.hit).toBe(true)
    expect(third.location.href).toBe('/items/9')
  })

  test('a literal search and hash stay location-independent', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = {
      to: '/items/$id',
      params: { id: '9' },
      search: { tab: 'specs' },
      hash: 'section-9',
    }

    expect(buildBoth(router, cache, opts).location.href).toBe(
      '/items/9?tab=specs#section-9',
    )

    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      search: { q: 'x' },
    })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(true)
    expect(second.location.href).toBe('/items/9?tab=specs#section-9')
  })

  // A plain `params` object does not have to be complete: `resolveNextParams`
  // merges it over the current location's params, so anything it leaves out is
  // inherited. Skipping the `usedParams` check and treating every plain object
  // as self-sufficient would memoize these links and freeze their href.
  test('a plain `params` object that omits a needed param still follows the current location', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
    })
    const editRoute = new BaseRoute({
      getParentRoute: () => postRoute,
      path: '/edit',
    })
    const tabRoute = new BaseRoute({
      getParentRoute: () => postRoute,
      path: '/tab/$tab',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postRoute.addChildren([editRoute, tabRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    })
    await router.load()

    const empty: BuildLocationCache = {}
    const partial: BuildLocationCache = {}
    const emptyOpts = { to: '/posts/$postId/edit', params: {} }
    const partialOpts = {
      to: '/posts/$postId/tab/$tab',
      params: { tab: 'stats' },
    }

    expect(buildBoth(router, empty, emptyOpts).location.href).toBe(
      '/posts/1/edit',
    )
    expect(buildBoth(router, partial, partialOpts).location.href).toBe(
      '/posts/1/tab/stats',
    )

    await router.navigate({ to: '/posts/$postId', params: { postId: '2' } })

    const emptyAfter = buildBoth(router, empty, emptyOpts)
    expect(emptyAfter.hit).toBe(false)
    expect(emptyAfter.location.href).toBe('/posts/2/edit')

    const partialAfter = buildBoth(router, partial, partialOpts)
    expect(partialAfter.hit).toBe(false)
    expect(partialAfter.location.href).toBe('/posts/2/tab/stats')
  })

  test('inherited params (`params` omitted) follow the current location', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id/detail' }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/1/detail')

    await router.navigate({ to: '/items/$id', params: { id: '2' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/items/2/detail')
  })

  test('`params: true` follows the current location', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id/detail', params: true }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/1/detail')
    await router.navigate({ to: '/items/$id', params: { id: '7' } })
    expect(buildBoth(router, cache, opts).location.href).toBe('/items/7/detail')
  })

  test('a params updater function follows the current location', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = {
      to: '/items/$id/detail',
      params: (prev: any) => ({ id: `${prev.id}-x` }),
    }

    expect(buildBoth(router, cache, opts).location.href).toBe(
      '/items/1-x/detail',
    )
    await router.navigate({ to: '/items/$id', params: { id: '7' } })
    expect(buildBoth(router, cache, opts).location.href).toBe(
      '/items/7-x/detail',
    )
  })

  test('a relative `to` follows the current location', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: 'detail' }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/1/detail')
    await router.navigate({ to: '/about' })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/about/detail')
  })

  test('`unsafeRelative: path` follows the current pathname', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: 'detail', unsafeRelative: 'path' as const }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/1/detail')
    await router.navigate({ to: '/items/$id', params: { id: '5' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/items/5/detail')
  })

  test('`search: true` follows the current search', async () => {
    const router = makeRouter('/items/1?tab=a')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/about', search: true }

    expect(buildBoth(router, cache, opts).location.href).toBe('/about?tab=a')
    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      search: { tab: 'b' },
    })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/about?tab=b')
  })

  test('a search updater function follows the current search', async () => {
    const router = makeRouter('/items/1?tab=a')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = {
      to: '/about',
      search: (prev: any) => ({ tab: prev.tab, extra: 1 }),
    }

    expect(buildBoth(router, cache, opts).location.href).toBe(
      '/about?tab=a&extra=1',
    )
    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      search: { tab: 'b' },
    })
    expect(buildBoth(router, cache, opts).location.href).toBe(
      '/about?tab=b&extra=1',
    )
  })

  test('retainSearchParams middleware follows the current search', async () => {
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: { tab?: string }) => search,
      search: { middlewares: [retainSearchParams(['tab'])] },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
    })
    const itemsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute, itemsRoute]),
      history: createMemoryHistory({ initialEntries: ['/items/1?tab=a'] }),
    })
    await router.load()

    const cache: BuildLocationCache = {}
    const opts = { to: '/about' }

    expect(buildBoth(router, cache, opts).location.href).toBe('/about?tab=a')
    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      search: { tab: 'b' },
    })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/about?tab=b')
  })

  test('`hash: true` and hash updaters follow the current hash', async () => {
    const router = makeRouter('/items/1#one')
    await router.load()
    const inherit: BuildLocationCache = {}
    const updater: BuildLocationCache = {}

    expect(
      buildBoth(router, inherit, { to: '/about', hash: true }).location.href,
    ).toBe('/about#one')
    expect(
      buildBoth(router, updater, {
        to: '/about',
        hash: (prev: string) => `${prev}-x`,
      }).location.href,
    ).toBe('/about#one-x')

    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      hash: 'two',
    })

    expect(
      buildBoth(router, inherit, { to: '/about', hash: true }).location.href,
    ).toBe('/about#two')
    expect(
      buildBoth(router, updater, {
        to: '/about',
        hash: (prev: string) => `${prev}-x`,
      }).location.href,
    ).toBe('/about#two-x')
  })

  test('`state: true` follows the current state', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/about', state: true }

    buildBoth(router, cache, opts)
    await router.navigate({
      to: '/items/$id',
      params: { id: '2' },
      state: { a: 1 } as any,
    })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect((second.location.state as any).a).toBe(1)
  })

  test('a route with params.stringify keeps following the current params', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const itemsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
      params: {
        // `stringify` reads a param the destination does not supply, so the
        // built location depends on the current location's params after all.
        stringify: (p: any) => ({ id: `${p.id}${p.suffix ?? ''}` }),
      },
    })
    const suffixRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/s/$suffix',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, itemsRoute, suffixRoute]),
      history: createMemoryHistory({ initialEntries: ['/s/a'] }),
    })
    await router.load()

    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id', params: { id: '9' } }
    expect(buildBoth(router, cache, opts).location.href).toBe('/items/9a')

    await router.navigate({ to: '/s/$suffix', params: { suffix: 'b' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/items/9b')
  })

  test('an explicit mask stays correct (memo disabled)', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = {
      to: '/items/$id',
      params: { id: '9' },
      mask: { to: '/items/$id/detail', params: true },
    }

    const first = buildBoth(router, cache, opts)
    expect(first.location.href).toBe('/items/9')
    expect(first.location.maskedLocation?.href).toBe('/items/1/detail')

    await router.navigate({ to: '/items/$id', params: { id: '2' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.maskedLocation?.href).toBe('/items/2/detail')
  })

  test('routeMasks disable the memo and keep resolving per navigation', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const itemsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$id',
    })
    const detailRoute = new BaseRoute({
      getParentRoute: () => itemsRoute,
      path: '/detail',
    })
    const routeTree = rootRoute.addChildren([
      indexRoute,
      itemsRoute.addChildren([detailRoute]),
    ])
    const router = createTestRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/items/1'] }),
      routeMasks: [
        {
          routeTree,
          from: '/items/$id/detail',
          to: '/items/$id',
        } as any,
      ],
    })
    await router.load()

    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id/detail', params: { id: '9' } }
    const first = buildBoth(router, cache, opts)
    expect(first.hit).toBe(false)
    expect(first.location.maskedLocation?.href).toBe('/items/9')

    await router.navigate({ to: '/items/$id', params: { id: '2' } })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.maskedLocation?.href).toBe('/items/9')
  })

  test('the memo is invalidated when router options change', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id', params: { id: '9' } }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/9')
    router.update({ ...router.options, basepath: '/app' })
    const second = buildBoth(router, cache, opts)
    expect(second.hit).toBe(false)
    expect(second.location.href).toBe('/app/items/9')
  })

  test('the memo is invalidated when the route tree is rebuilt (HMR)', async () => {
    const router = makeRouter('/items/1')
    await router.load()
    const cache: BuildLocationCache = {}
    const opts = { to: '/items/$id', params: { id: '9' } }

    expect(buildBoth(router, cache, opts).location.href).toBe('/items/9')
    // `handleRouteUpdate` in router-plugin swaps route options in place and
    // rebuilds the tree without touching `router.options`.
    router.setRoutes(router.buildRouteTree())
    expect(buildBoth(router, cache, opts).hit).toBe(false)
  })

  test('a splat destination that supplies _splat is location-independent', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const filesRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/files/$',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, filesRoute]),
      history: createMemoryHistory({ initialEntries: ['/files/a/b'] }),
    })
    await router.load()

    const supplied: BuildLocationCache = {}
    const inherited: BuildLocationCache = {}
    expect(
      buildBoth(router, supplied, { to: '/files/$', params: { _splat: 'x/y' } })
        .location.href,
    ).toBe('/files/x/y')
    expect(buildBoth(router, inherited, { to: '/files/$' }).location.href).toBe(
      '/files/a/b',
    )

    await router.navigate({ to: '/files/$', params: { _splat: 'c/d' } })

    const suppliedAfter = buildBoth(router, supplied, {
      to: '/files/$',
      params: { _splat: 'x/y' },
    })
    expect(suppliedAfter.hit).toBe(true)
    expect(suppliedAfter.location.href).toBe('/files/x/y')

    const inheritedAfter = buildBoth(router, inherited, { to: '/files/$' })
    expect(inheritedAfter.hit).toBe(false)
    expect(inheritedAfter.location.href).toBe('/files/c/d')
  })
})
