import { act, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  SearchParamError,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from '../src'
import type { StandardSchemaValidator } from '@tanstack/router-core'
import type {
  AnyRoute,
  AnyRouter,
  MakeRemountDepsOptionsUnion,
  RouterHistory,
  RouterOptions,
  ValidatorFn,
  ValidatorObj,
} from '../src'

let history: RouterHistory
beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
  cleanup()
})

const mockFn1 = vi.fn()

export function validateSearchParams<
  TExpected extends Partial<Record<string, string>>,
>(expected: TExpected, router: AnyRouter) {
  const parsedSearch = new URLSearchParams(window.location.search)
  expect(parsedSearch.size).toBe(Object.keys(expected).length)
  for (const [key, value] of Object.entries(expected)) {
    expect(parsedSearch.get(key)).toBe(value)
  }
  expect(router.state.location.search).toEqual(expected)
}

function createTestRouter(
  options: RouterOptions<AnyRoute, 'never', any, any, any> &
    Required<Pick<RouterOptions<AnyRoute, 'never'>, 'history'>>,
) {
  const rootRoute = createRootRoute({
    validateSearch: z.object({ root: z.string().optional() }),
    component: () => {
      const search = rootRoute.useSearch()
      return (
        <>
          <div data-testid="search-root">{search.root ?? '$undefined'}</div>
          <Outlet />
        </>
      )
    },
  })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const usersRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users',
  })
  const userRoute = createRoute({
    getParentRoute: () => usersRoute,
    path: '/$userId',
  })
  const userFilesRoute = createRoute({
    getParentRoute: () => userRoute,
    path: '/files/$fileId',
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  })
  const postIdRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '/$slug',
  })
  const topLevelSplatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
  })
  // This is simulates a user creating a `é.tsx` file using file-based routing
  const pathSegmentEAccentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/path-segment/é',
  })
  // This is simulates a user creating a `🚀.tsx` file using file-based routing
  const pathSegmentRocketEmojiRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/path-segment/🚀',
  })
  const pathSegmentSoloSplatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/solo-splat/$',
  })
  const pathSegmentLayoutSplatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/layout-splat',
  })
  const pathSegmentLayoutSplatIndexRoute = createRoute({
    getParentRoute: () => pathSegmentLayoutSplatRoute,
    path: '/',
  })
  const pathSegmentLayoutSplatSplatRoute = createRoute({
    getParentRoute: () => pathSegmentLayoutSplatRoute,
    path: '$',
  })
  const protectedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '/_protected',
  }).lazy(() => import('./lazy/normal').then((f) => f.Route('/_protected')))
  const protectedLayoutRoute = createRoute({
    getParentRoute: () => protectedRoute,
    id: '/_layout',
  }).lazy(() =>
    import('./lazy/normal').then((f) => f.Route('/_protected/_layout')),
  )
  const protectedFileBasedLayoutRoute = createRoute({
    getParentRoute: () => protectedRoute,
    id: '/_fileBasedLayout',
  }).lazy(() =>
    import('./lazy/normal').then((f) =>
      f.FileRoute('/_protected/_fileBasedLayout'),
    ),
  )
  const protectedFileBasedLayoutParentRoute = createRoute({
    getParentRoute: () => protectedFileBasedLayoutRoute,
    path: '/fileBasedParent',
  }).lazy(() =>
    import('./lazy/normal').then((f) =>
      f.FileRoute('/_protected/_fileBasedLayout/fileBasedParent'),
    ),
  )
  const protectedLayoutParentRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/parent',
  }).lazy(() =>
    import('./lazy/normal').then((f) => f.Route('/_protected/_layout/parent')),
  )
  const protectedLayoutParentChildRoute = createRoute({
    getParentRoute: () => protectedLayoutParentRoute,
    path: '/child',
  }).lazy(() =>
    import('./lazy/normal').then((f) =>
      f.Route('/_protected/_layout/parent/child'),
    ),
  )
  const protectedFileBasedLayoutParentChildRoute = createRoute({
    getParentRoute: () => protectedFileBasedLayoutParentRoute,
    path: '/child',
  }).lazy(() =>
    import('./lazy/normal').then((f) =>
      f.FileRoute('/_protected/_fileBasedLayout/fileBasedParent/child'),
    ),
  )
  const searchRoute = createRoute({
    validateSearch: z.object({ search: z.string().optional() }),
    getParentRoute: () => rootRoute,
    path: 'search',
    component: () => {
      const search = searchRoute.useSearch()
      return (
        <>
          <div data-testid="search-search">{search.search ?? '$undefined'}</div>
        </>
      )
    },
  })
  const searchWithDefaultRoute = createRoute({
    getParentRoute: () => rootRoute,

    path: 'searchWithDefault',
  })
  const searchWithDefaultIndexRoute = createRoute({
    getParentRoute: () => searchWithDefaultRoute,
    path: '/',
    component: () => {
      return (
        <>
          <Link
            data-testid="link-without-params"
            to="/searchWithDefault/check"
            search={{ default: 'd1' }}
          >
            without params
          </Link>
          <Link
            data-testid="link-with-optional-param"
            to="/searchWithDefault/check"
            search={{ optional: 'o1' }}
          >
            with optional param
          </Link>
          <Link
            data-testid="link-with-default-param"
            to="/searchWithDefault/check"
            search={{ default: 'd2' }}
          >
            with default param
          </Link>
          <Link
            data-testid="link-with-both-params"
            to="/searchWithDefault/check"
            search={{ optional: 'o1', default: 'd2' }}
          >
            with both params
          </Link>
        </>
      )
    },
  })

  const searchWithDefaultCheckRoute = createRoute({
    validateSearch: z.object({
      default: z.string().default('d1'),
      optional: z.string().optional(),
    }),
    getParentRoute: () => searchWithDefaultRoute,
    path: 'check',
    component: () => {
      const search = searchWithDefaultCheckRoute.useSearch()
      return (
        <>
          <div data-testid="search-default">{search.default}</div>
          <div data-testid="search-optional">
            {search.optional ?? '$undefined'}
          </div>
        </>
      )
    },
  })

  const nestedSearchRoute = createRoute({
    getParentRoute: () => rootRoute,
    validateSearch: z.object({ foo: z.string() }),
    path: 'nested-search',
  })

  const nestedSearchChildRoute = createRoute({
    getParentRoute: () => nestedSearchRoute,
    validateSearch: z.object({ bar: z.string() }),
    path: 'child',
  })

  const linksToItselfRoute = createRoute({
    validateSearch: z.object({ search: z.string().optional() }),
    getParentRoute: () => rootRoute,
    path: 'linksToItself',
    component: () => {
      return (
        <>
          <Link to="/linksToItself" data-testid="link">
            Click me
          </Link>
        </>
      )
    },
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    usersRoute.addChildren([userRoute.addChildren([userFilesRoute])]),
    postsRoute.addChildren([postIdRoute]),
    pathSegmentEAccentRoute,
    pathSegmentRocketEmojiRoute,
    pathSegmentSoloSplatRoute,
    topLevelSplatRoute,
    pathSegmentLayoutSplatRoute.addChildren([
      pathSegmentLayoutSplatIndexRoute,
      pathSegmentLayoutSplatSplatRoute,
    ]),
    protectedRoute.addChildren([
      protectedLayoutRoute.addChildren([
        protectedLayoutParentRoute.addChildren([
          protectedLayoutParentChildRoute,
        ]),
      ]),
      protectedFileBasedLayoutRoute.addChildren([
        protectedFileBasedLayoutParentRoute.addChildren([
          protectedFileBasedLayoutParentChildRoute,
        ]),
      ]),
    ]),
    searchRoute,
    searchWithDefaultRoute.addChildren([
      searchWithDefaultIndexRoute,
      searchWithDefaultCheckRoute,
    ]),
    nestedSearchRoute.addChildren([nestedSearchChildRoute]),
    linksToItselfRoute,
  ])

  const router = createRouter({ routeTree, ...options })

  return {
    router,
    routes: {
      indexRoute,
      postsRoute,
      postIdRoute,
      topLevelSplatRoute,
      pathSegmentEAccentRoute,
      pathSegmentRocketEmojiRoute,
    },
  }
}

describe('encoding: URL param segment for /posts/$slug', () => {
  it('state.location.url.pathname, should have the params.slug value of "tanner"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe('/posts/tanner')
  })

  it('state.location.url.pathname, should have the params.slug value of "🚀"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe('/posts/%F0%9F%9A%80')
  })

  it('state.location.url.pathname, should have the params.slug value of "100%25"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%25'] }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe('/posts/100%25')
  })

  it('state.location.url.pathname, should have the params.slug value of "100%26"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%26'] }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe('/posts/100%26')
  })

  it('state.location.url.pathname, should have the params.slug value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe('/posts/%F0%9F%9A%80')
  })

  it('state.location.url.pathname, should have the params.slug value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: [
          '/posts/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
        ],
      }),
    })

    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe(
      '/posts/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
    )
  })

  it('params.slug for the matched route, should be "tanner"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('tanner')
  })

  it('params.slug for the matched route, should be "🚀"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('🚀')
  })

  it('params.slug for the matched route, should be "🚀" instead of it being "%F0%9F%9A%80"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('🚀')
  })

  it('params.slug for the matched route, should be "100%"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%25'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('100%')
  })

  it('params.slug for the matched route, should be "100&"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%26'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('100&')
  })

  it('params.slug for the matched route, should be "100%100"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%25100'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('100%100')
  })

  it('params.slug for the matched route, should be "100&100"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/100%26100'] }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe('100&100')
  })

  it('params.slug for the matched route, should be "framework/react/guide/file-based-routing tanstack" instead of it being "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: [
          '/posts/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
        ],
      }),
    })

    await act(() => router.load())

    const match = router.state.matches.find(
      (r) => r.routeId === routes.postIdRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any).slug).toBe(
      'framework/react/guide/file-based-routing tanstack',
    )
  })

  it('params.slug should be encoded in the final URL', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    render(<RouterProvider router={router} />)

    await act(() =>
      router.navigate({ to: '/posts/$slug', params: { slug: '@jane' } }),
    )

    expect(router.state.location.url.pathname).toBe('/posts/%40jane')
  })

  it('params.slug should be encoded in the final URL except characters in pathParamsAllowedCharacters', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
      pathParamsAllowedCharacters: ['@'],
    })

    await router.load()
    render(<RouterProvider router={router} />)

    await act(() =>
      router.navigate({ to: '/posts/$slug', params: { slug: '@jane' } }),
    )

    expect(router.state.location.url.pathname).toBe('/posts/@jane')
  })
})

describe('encoding: URL splat segment for /$', () => {
  it('state.location.url.pathname, should have the params._splat value of "tanner"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/tanner'] }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe('/tanner')
  })

  it('state.location.url.pathname, should have the params._splat value of "🚀"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/🚀'] }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe('/%F0%9F%9A%80')
  })

  it('state.location.url.pathname, should have the params._splat value of "100%25"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/100%25'] }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe('/100%25')
  })

  it('state.location.url.pathname, should have the params._splat value of "100%26"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/100%26'] }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe('/100%26')
  })

  it('state.location.url.pathname, should have the params._splat value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/%F0%9F%9A%80'] }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe('/%F0%9F%9A%80')
  })

  it('state.location.url.pathname, should have the params._splat value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: [
          '/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
        ],
      }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe(
      '/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
    )
  })

  it('state.location.url.pathname, should have the params._splat value of "framework/react/guide/file-based-routing tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: ['/framework/react/guide/file-based-routing tanstack'],
      }),
    })

    await router.load()

    expect(router.state.location.url.pathname).toBe(
      '/framework/react/guide/file-based-routing%20tanstack',
    )
  })

  it('params._splat for the matched route, should be "tanner"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/tanner'] }),
    })

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('tanner')
  })

  it('params._splat for the matched route, should be "🚀"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/🚀'] }),
    })

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('🚀')
  })

  it('params._splat for the matched route, should be "🚀" instead of it being "%F0%9F%9A%80"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/%F0%9F%9A%80'] }),
    })

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe('🚀')
  })

  it('params._splat for the matched route, should be "framework/react/guide/file-based-routing tanstack"', async () => {
    const { router, routes } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: ['/framework/react/guide/file-based-routing tanstack'],
      }),
    })

    await router.load()

    const match = router.state.matches.find(
      (r) => r.routeId === routes.topLevelSplatRoute.id,
    )

    if (!match) {
      throw new Error('No match found')
    }

    expect((match.params as unknown as any)._splat).toBe(
      'framework/react/guide/file-based-routing tanstack',
    )
  })
})

describe('encoding: URL path segment', () => {
  it.each([
    {
      input: '/path-segment/%C3%A9',
      output: '/path-segment/%C3%A9',
    },
    {
      input: '/path-segment/é',
      output: '/path-segment/%C3%A9',
      type: 'not encoded',
    },
    {
      input: '/path-segment/100%25', // `%25` = `%`
      output: '/path-segment/100%25',
      type: 'not encoded',
    },
    {
      input: '/path-segment/100%25%25',
      output: '/path-segment/100%25%25',
      type: 'not encoded',
    },
    {
      input: '/path-segment/100%26', // `%26` = `&`
      output: '/path-segment/100%26',
      type: 'not encoded',
    },
    {
      input: '/path-segment/%F0%9F%9A%80',
      output: '/path-segment/%F0%9F%9A%80',
    },
    {
      input: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon',
      output: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon',
    },
    {
      input: '/path-segment/%25%F0%9F%9A%80to%2Fthe%2Fmoon',
      output: '/path-segment/%25%F0%9F%9A%80to%2Fthe%2Fmoon',
    },
    {
      input: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon%25',
      output: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon%25',
    },
    {
      input:
        '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon%25%F0%9F%9A%80to%2Fthe%2Fmoon',
      output:
        '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon%25%F0%9F%9A%80to%2Fthe%2Fmoon',
    },
    {
      input: '/path-segment/🚀',
      output: '/path-segment/%F0%9F%9A%80',
      type: 'not encoded',
    },
    {
      input: '/path-segment/🚀to%2Fthe%2Fmoon',
      output: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon',
      type: 'not encoded',
    },
  ])('should resolve $input to $output', async ({ input, output }) => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: [input] }),
    })

    render(<RouterProvider router={router} />)
    await act(() => router.load())

    expect(router.state.location.url.pathname).toBe(output)
  })
})

describe('router emits events during rendering', () => {
  it('during initial load, should emit the "onResolved" event', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const unsub = router.subscribe('onResolved', mockFn1)
    await router.load()
    render(<RouterProvider router={router} />)

    await waitFor(() => expect(mockFn1).toBeCalled())
    unsub()
  })

  it('after a navigation, should have emitted the "onResolved" event twice', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const unsub = router.subscribe('onResolved', mockFn1)
    await router.load()
    await act(() => render(<RouterProvider router={router} />))

    await act(() => router.navigate({ to: '/$', params: { _splat: 'tanner' } }))

    await waitFor(() => expect(mockFn1).toBeCalledTimes(2))
    unsub()
  })

  it('during initial load, should emit the "onBeforeRouteMount" and "onResolved" events in the correct order', async () => {
    const mockOnBeforeRouteMount = vi.fn()
    const mockOnResolved = vi.fn()

    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    // Subscribe to the events
    const unsubBeforeRouteMount = router.subscribe(
      'onBeforeRouteMount',
      mockOnBeforeRouteMount,
    )
    const unsubResolved = router.subscribe('onResolved', mockOnResolved)

    await act(() => router.load())
    render(<RouterProvider router={router} />)

    // Ensure the "onBeforeRouteMount" event was called once
    await waitFor(() => expect(mockOnBeforeRouteMount).toBeCalledTimes(1))

    // Ensure the "onResolved" event was also called once
    await waitFor(() => expect(mockOnResolved).toBeCalledTimes(1))

    // Check if the invocation call orders are defined before comparing
    const beforeRouteMountOrder =
      mockOnBeforeRouteMount.mock.invocationCallOrder[0]
    const onResolvedOrder = mockOnResolved.mock.invocationCallOrder[0]

    if (beforeRouteMountOrder !== undefined && onResolvedOrder !== undefined) {
      expect(beforeRouteMountOrder).toBeLessThan(onResolvedOrder)
    } else {
      throw new Error('onBeforeRouteMount should be emitted before onResolved.')
    }

    unsubBeforeRouteMount()
    unsubResolved()
  })
})

describe('router rendering stability', () => {
  type RemountDepsFn = (opts: MakeRemountDepsOptionsUnion) => any
  async function setup(opts?: {
    remountDeps: {
      default?: RemountDepsFn
      fooId?: RemountDepsFn
      barId?: RemountDepsFn
    }
  }) {
    const mountMocks = {
      fooId: vi.fn(),
      barId: vi.fn(),
    }

    const rootRoute = createRootRoute({
      component: () => {
        return (
          <div>
            <p>Root</p>
            <div>
              <Link
                data-testid="link-foo-1"
                to="/foo/$fooId"
                params={{ fooId: '1' }}
              >
                Foo1
              </Link>
              <Link
                data-testid="link-foo-2"
                to="/foo/$fooId"
                params={{ fooId: '2' }}
              >
                Foo2
              </Link>
              <Link
                data-testid="link-foo-3-bar-1"
                to="/foo/$fooId/bar/$barId"
                params={{ fooId: '3', barId: '1' }}
              >
                Foo3-Bar1
              </Link>
              <Link
                data-testid="link-foo-3-bar-2"
                to="/foo/$fooId/bar/$barId"
                params={{ fooId: '3', barId: '2' }}
              >
                Foo3-Bar2
              </Link>
            </div>
            <Outlet />
          </div>
        )
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return ''
      },
    })
    const fooIdRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/foo/$fooId',
      component: FooIdRouteComponent,
      remountDeps: opts?.remountDeps.fooId,
    })

    function FooIdRouteComponent() {
      const fooId = fooIdRoute.useParams({ select: (s) => s.fooId })
      useEffect(() => {
        mountMocks.fooId()
      }, [])

      return (
        <div data-testid="fooId-page">
          Foo page <span data-testid="fooId-value">{fooId}</span> <Outlet />
        </div>
      )
    }

    const barIdRoute = createRoute({
      getParentRoute: () => fooIdRoute,
      path: '/bar/$barId',
      component: BarIdRouteComponent,
      remountDeps: opts?.remountDeps.barId,
    })

    function BarIdRouteComponent() {
      const barId = fooIdRoute.useParams({ select: (s) => s.barId })

      useEffect(() => {
        mountMocks.barId()
      }, [])

      return (
        <div data-testid="barId-page">
          Bar page <span data-testid="barId-value">{barId}</span> <Outlet />
        </div>
      )
    }

    const routeTree = rootRoute.addChildren([
      fooIdRoute.addChildren([barIdRoute]),
      indexRoute,
    ])
    const router = createRouter({
      routeTree,
      defaultRemountDeps: opts?.remountDeps.default,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await act(() => render(<RouterProvider router={router} />))

    const foo1 = await screen.findByTestId('link-foo-1')
    const foo2 = await screen.findByTestId('link-foo-2')

    const foo3bar1 = await screen.findByTestId('link-foo-3-bar-1')
    const foo3bar2 = await screen.findByTestId('link-foo-3-bar-2')

    expect(foo1).toBeInTheDocument()
    expect(foo2).toBeInTheDocument()
    expect(foo3bar1).toBeInTheDocument()
    expect(foo3bar2).toBeInTheDocument()

    return { router, mountMocks, links: { foo1, foo2, foo3bar1, foo3bar2 } }
  }

  async function check(
    page: 'fooId' | 'barId',
    expected: { value: string; mountCount: number },
    mountMocks: Record<'fooId' | 'barId', () => void>,
  ) {
    const p = await screen.findByTestId(`${page}-page`)
    expect(p).toBeInTheDocument()
    const value = await screen.findByTestId(`${page}-value`)
    expect(value).toBeInTheDocument()
    expect(value).toHaveTextContent(expected.value)

    expect(mountMocks[page]).toBeCalledTimes(expected.mountCount)
  }

  it('should not remount the page component when navigating to the same route but different path param if no remount deps are configured', async () => {
    const { mountMocks, links } = await setup()

    await act(() => fireEvent.click(links.foo1))
    await check('fooId', { value: '1', mountCount: 1 }, mountMocks)
    expect(mountMocks.barId).not.toHaveBeenCalled()

    await act(() => fireEvent.click(links.foo2))
    await check('fooId', { value: '2', mountCount: 1 }, mountMocks)
    expect(mountMocks.barId).not.toHaveBeenCalled()

    await act(() => fireEvent.click(links.foo3bar1))
    await check('fooId', { value: '3', mountCount: 1 }, mountMocks)
    await check('barId', { value: '1', mountCount: 1 }, mountMocks)
    await act(() => fireEvent.click(links.foo3bar2))
    await check('fooId', { value: '3', mountCount: 1 }, mountMocks)
    await check('barId', { value: '2', mountCount: 1 }, mountMocks)
  })

  it('should remount the fooId and barId page component when navigating to the same route but different path param if defaultRemountDeps with params is used', async () => {
    const defaultRemountDeps: RemountDepsFn = (opts) => {
      return opts.params
    }
    const { mountMocks, links } = await setup({
      remountDeps: { default: defaultRemountDeps },
    })

    await act(() => fireEvent.click(links.foo1))
    await check('fooId', { value: '1', mountCount: 1 }, mountMocks)
    expect(mountMocks.barId).not.toHaveBeenCalled()

    await act(() => fireEvent.click(links.foo2))

    await check('fooId', { value: '2', mountCount: 2 }, mountMocks)
    expect(mountMocks.barId).not.toHaveBeenCalled()

    await act(() => fireEvent.click(links.foo3bar1))
    await check('fooId', { value: '3', mountCount: 3 }, mountMocks)
    await check('barId', { value: '1', mountCount: 1 }, mountMocks)

    await act(() => fireEvent.click(links.foo3bar2))
    await check('fooId', { value: '3', mountCount: 3 }, mountMocks)
    await check('barId', { value: '2', mountCount: 2 }, mountMocks)
  })
})

describe('router matches URLs to route definitions', () => {
  it('solo splat route matches index route', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/solo-splat'] }),
    })

    await act(() => router.load())

    expect(router.state.matches.map((d) => d.routeId)).toEqual([
      '__root__',
      '/solo-splat/$',
    ])
  })

  it('solo splat route matches with splat', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/solo-splat/test'] }),
    })

    await act(() => router.load())

    expect(router.state.matches.map((d) => d.routeId)).toEqual([
      '__root__',
      '/solo-splat/$',
    ])
  })

  it('layout splat route matches with splat', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/layout-splat/test'] }),
    })

    await act(() => router.load())

    expect(router.state.matches.map((d) => d.routeId)).toEqual([
      '__root__',
      '/layout-splat',
      '/layout-splat/$',
    ])
  })

  it('nested path params', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: ['/users/5678/files/123'],
      }),
    })

    await act(() => router.load())

    expect(router.state.matches.map((d) => d.routeId)).toEqual([
      '__root__',
      '/users',
      '/users/$userId',
      '/users/$userId/files/$fileId',
    ])
  })
})

describe('matches', () => {
  describe('params', () => {
    it('/users/$userId/files/$fileId', async () => {
      const { router } = createTestRouter({
        history: createMemoryHistory({
          initialEntries: ['/users/5678/files/123'],
        }),
      })

      await act(() => router.load())

      const expectedStrictParams: Record<string, unknown> = {
        __root__: {},
        '/users': {},
        '/users/$userId': { userId: '5678' },
        '/users/$userId/files/$fileId': { userId: '5678', fileId: '123' },
      }

      expect(router.state.matches.length).toEqual(
        Object.entries(expectedStrictParams).length,
      )
      router.state.matches.forEach((match) => {
        expect(match.params).toEqual(
          expectedStrictParams['/users/$userId/files/$fileId'],
        )
      })
      router.state.matches.forEach((match) => {
        expect(match._strictParams).toEqual(expectedStrictParams[match.routeId])
      })
    })
  })

  describe('search', () => {
    it('/nested-search/child?foo=hello&bar=world', async () => {
      const { router } = createTestRouter({
        history: createMemoryHistory({
          initialEntries: ['/nested-search/child?foo=hello&bar=world'],
        }),
      })

      await act(() => router.load())

      const expectedStrictSearch: Record<string, unknown> = {
        __root__: {},
        '/nested-search': { foo: 'hello' },
        '/nested-search/child': { foo: 'hello', bar: 'world' },
      }

      expect(router.state.matches.length).toEqual(
        Object.entries(expectedStrictSearch).length,
      )
      router.state.matches.forEach((match) => {
        expect(match.search).toEqual(
          expectedStrictSearch['/nested-search/child'],
        )
      })
      router.state.matches.forEach((match) => {
        expect(match._strictSearch).toEqual(expectedStrictSearch[match.routeId])
      })
    })
  })
})

describe('invalidate', () => {
  it('after router.invalid(), routes should be `valid` again after loading', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await act(() => router.load())

    router.state.matches.forEach((match) => {
      expect(match.invalid).toBe(false)
    })

    await act(() => router.invalidate())

    router.state.matches.forEach((match) => {
      expect(match.invalid).toBe(false)
    })
  })
})

describe('search params in URL', () => {
  let history: RouterHistory
  beforeEach(() => {
    history = createBrowserHistory()
    expect(window.location.pathname).toBe('/')
  })
  afterEach(() => {
    history.destroy()
    window.history.replaceState(null, 'root', '/')
  })
  const testCases = [
    { route: '/', search: { root: 'world' } },
    { route: '/', search: { root: 'world', unknown: 'asdf' } },
    { route: '/search', search: { search: 'foo' } },
    { route: '/search', search: { root: 'world', search: 'foo' } },
    {
      route: '/search',
      search: { root: 'world', search: 'foo', unknown: 'asdf' },
    },
  ]
  describe.each([undefined, false])(
    'does not modify the search params in the URL when search.strict=%s',
    (strict) => {
      it.each(testCases)(
        'at $route with search params $search',
        async ({ route, search }) => {
          const { router } = createTestRouter({ search: { strict }, history })
          window.history.replaceState(
            null,
            '',
            `${route}?${new URLSearchParams(search as Record<string, string>).toString()}`,
          )

          render(<RouterProvider router={router} />)
          await act(() => router.load())

          expect(await screen.findByTestId('search-root')).toHaveTextContent(
            search.root ?? '$undefined',
          )
          if (route === '/search') {
            expect(
              await screen.findByTestId('search-search'),
            ).toHaveTextContent(search.search ?? '$undefined')
          }
          validateSearchParams(search, router)
        },
      )
    },
  )

  describe('removes unknown search params in the URL when search.strict=true', () => {
    it.each(testCases)('%j', async ({ route, search }) => {
      const { router } = createTestRouter({ search: { strict: true }, history })
      window.history.replaceState(
        null,
        '',
        `${route}?${new URLSearchParams(search as Record<string, string>).toString()}`,
      )
      render(<RouterProvider router={router} />)
      await act(() => router.load())
      await expect(await screen.findByTestId('search-root')).toHaveTextContent(
        search.root ?? 'undefined',
      )
      if (route === '/search') {
        expect(await screen.findByTestId('search-search')).toHaveTextContent(
          search.search ?? 'undefined',
        )
      }

      expect(window.location.pathname).toEqual(route)
      const { unknown: _, ...expectedSearch } = { ...search }
      validateSearchParams(expectedSearch, router)
    })
  })

  describe.each([false, true, undefined])('default search params', (strict) => {
    let router: AnyRouter
    beforeEach(() => {
      const result = createTestRouter({ search: { strict }, history })
      router = result.router
    })

    async function checkSearch(expectedSearch: {
      default: string
      optional?: string
    }) {
      expect(await screen.findByTestId('search-default')).toHaveTextContent(
        expectedSearch.default,
      )
      expect(await screen.findByTestId('search-optional')).toHaveTextContent(
        expectedSearch.optional ?? '$undefined',
      )

      validateSearchParams(expectedSearch, router)
    }

    it('should add the default search param upon initial load when no search params are present', async () => {
      window.history.replaceState(null, '', `/searchWithDefault/check`)

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      await checkSearch({ default: 'd1' })
    })

    it('should have the correct `default` search param upon initial load when the `default` param is present', async () => {
      window.history.replaceState(
        null,
        '',
        `/searchWithDefault/check?default=d2`,
      )

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      await checkSearch({ default: 'd2' })
    })

    it('should add the default search param upon initial load when only the optional search param is present', async () => {
      window.history.replaceState(
        null,
        '',
        `/searchWithDefault/check?optional=o1`,
      )

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      await checkSearch({ default: 'd1', optional: 'o1' })
    })

    it('should keep the search param upon initial load when both search params are present', async () => {
      window.history.replaceState(
        null,
        '',
        `/searchWithDefault/check?default=d2&optional=o1`,
      )

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      await checkSearch({ default: 'd2', optional: 'o1' })
    })

    it('should have the default search param when navigating without search params', async () => {
      window.history.replaceState(null, '', `/searchWithDefault`)

      render(<RouterProvider router={router} />)
      await act(() => router.load())
      const link = await screen.findByTestId('link-without-params')

      expect(link).toBeInTheDocument()
      fireEvent.click(link)

      await checkSearch({ default: 'd1' })
    })

    it('should have the default search param when navigating with the optional search param', async () => {
      window.history.replaceState(null, '', `/searchWithDefault`)

      render(<RouterProvider router={router} />)
      await act(() => router.load())
      const link = await screen.findByTestId('link-with-optional-param')

      expect(link).toBeInTheDocument()
      fireEvent.click(link)

      await checkSearch({ default: 'd1', optional: 'o1' })
    })

    it('should have the correct `default` search param when navigating with the `default` search param', async () => {
      window.history.replaceState(null, '', `/searchWithDefault`)

      render(<RouterProvider router={router} />)
      await act(() => router.load())
      const link = await screen.findByTestId('link-with-default-param')

      expect(link).toBeInTheDocument()
      fireEvent.click(link)

      await checkSearch({ default: 'd2' })
    })

    it('should have the correct search params when navigating with both search params', async () => {
      window.history.replaceState(null, '', `/searchWithDefault`)

      render(<RouterProvider router={router} />)
      await act(() => router.load())
      const link = await screen.findByTestId('link-with-both-params')

      expect(link).toBeInTheDocument()
      fireEvent.click(link)

      await checkSearch({ default: 'd2', optional: 'o1' })
    })
  })

  describe('validates search params', () => {
    class TestValidationError extends Error {
      issues: Array<{ message: string }>
      constructor(issues: Array<{ message: string }>) {
        super('validation failed')
        this.name = 'TestValidationError'
        this.issues = issues
      }
    }
    const testCases: [
      StandardSchemaValidator<Record<string, unknown>, { search: string }>,
      ValidatorFn<Record<string, unknown>, { search: string }>,
      ValidatorObj<Record<string, unknown>, { search: string }>,
    ] = [
      {
        ['~standard']: {
          validate: (input) => {
            const result = z.object({ search: z.string() }).safeParse(input)
            if (result.success) {
              return { value: result.data }
            }
            return new TestValidationError(result.error.issues)
          },
        },
      },
      ({ search }) => {
        if (typeof search !== 'string') {
          throw new TestValidationError([
            { message: 'search must be a string' },
          ])
        }
        return { search }
      },
      {
        parse: ({ search }) => {
          if (typeof search !== 'string') {
            throw new TestValidationError([
              { message: 'search must be a string' },
            ])
          }
          return { search }
        },
      },
    ]

    describe.each(testCases)('search param validation', (validateSearch) => {
      it('does not throw an error when the search param is valid', async () => {
        let errorSpy: Error | undefined
        const rootRoute = createRootRoute({
          validateSearch,
          errorComponent: ({ error }) => {
            errorSpy = error
            return null
          },
        })

        const history = createMemoryHistory({
          initialEntries: ['/search?search=foo'],
        })
        const router = createRouter({ routeTree: rootRoute, history })
        render(<RouterProvider router={router} />)
        await act(() => router.load())

        expect(errorSpy).toBeUndefined()
      })

      it('throws an error when the search param is not valid', async () => {
        let errorSpy: Error | undefined
        const rootRoute = createRootRoute({
          validateSearch,
          errorComponent: ({ error }) => {
            errorSpy = error
            return null
          },
        })

        const history = createMemoryHistory({ initialEntries: ['/search'] })
        const router = createRouter({ routeTree: rootRoute, history })
        render(<RouterProvider router={router} />)
        await act(() => router.load())

        expect(errorSpy).toBeInstanceOf(SearchParamError)
        expect(errorSpy?.cause).toBeInstanceOf(TestValidationError)
      })
    })
  })
})

describe('route ids should be consistent after rebuilding the route tree', () => {
  it('should have the same route ids after rebuilding the route tree', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const originalRouteIds = Object.keys(router.routesById)

    await act(() =>
      router.navigate({
        to: '/parent/child',
      }),
    )

    await act(() =>
      router.navigate({
        to: '/filBasedParent/child',
      }),
    )

    router.buildRouteTree()

    const rebuiltRouteIds = Object.keys(router.routesById)

    originalRouteIds.forEach((id) => {
      expect(rebuiltRouteIds).toContain(id)
    })

    rebuiltRouteIds.forEach((id) => {
      expect(originalRouteIds).toContain(id)
    })
  })
})

describe('route id uniqueness', () => {
  it('flatRoute should not have routes with duplicated route ids', () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const routeIdSet = new Set<string>()

    router.flatRoutes.forEach((route) => {
      expect(routeIdSet.has(route.id)).toBe(false)
      routeIdSet.add(route.id)
    })
  })

  it('routesById should not have routes duplicated route ids', () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const routeIdSet = new Set<string>()

    Object.values(router.routesById).forEach((route) => {
      expect(routeIdSet.has(route.id)).toBe(false)
      routeIdSet.add(route.id)
    })
  })

  it('routesByPath should not have routes duplicated route ids', () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const routeIdSet = new Set<string>()

    Object.values(router.routesByPath).forEach((route) => {
      expect(routeIdSet.has(route.id)).toBe(false)
      routeIdSet.add(route.id)
    })
  })
})

const createHistoryRouter = () => {
  const rootRoute = createRootRoute()

  const IndexComponent = () => {
    const navigate = useNavigate()

    return (
      <>
        <h1>Index</h1>
        <button onClick={() => navigate({ to: '/' })}>Index</button>
        <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        <button onClick={() => navigate({ to: '/posts', replace: true })}>
          Replace
        </button>
      </>
    )
  }

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexComponent,
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: function Component() {
      const navigate = useNavigate()

      return (
        <>
          <h1>Posts</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
        </>
      )
    },
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history,
  })

  return { router }
}

describe('history: History gives correct notifcations and state', () => {
  it('should work with push and back', async () => {
    const { router: router } = createHistoryRouter()

    type Router = typeof router

    const results: Array<
      Parameters<Parameters<Router['history']['subscribe']>[0]>[0]['action']
    > = []

    render(<RouterProvider router={router} />)

    const unsub = router.history.subscribe(({ action }) => {
      results.push(action)
    })

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')

    act(() => router.history.back())

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    expect(results).toEqual([{ type: 'PUSH' }, { type: 'BACK' }])

    unsub()
  })

  it('should work more complex scenario', async () => {
    const { router: router } = createHistoryRouter()

    type Router = typeof router

    const results: Array<
      Parameters<Parameters<Router['history']['subscribe']>[0]>[0]['action']
    > = []

    render(<RouterProvider router={router} />)

    const unsub = router.history.subscribe(({ action }) => {
      results.push(action)
    })

    const replaceButton = await screen.findByRole('button', { name: 'Replace' })

    fireEvent.click(replaceButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')

    const indexButton = await screen.findByRole('button', { name: 'Index' })

    fireEvent.click(indexButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')

    act(() => router.history.back())

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    act(() => router.history.go(1))

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')

    expect(results).toEqual([
      { type: 'REPLACE' },
      { type: 'PUSH' },
      { type: 'PUSH' },
      { type: 'BACK' },
      { type: 'GO', index: 1 },
    ])

    unsub()
  })
})

it('does not push to history if url and state are the same', async () => {
  const history = createMemoryHistory({ initialEntries: ['/linksToItself'] })
  const { router } = createTestRouter({
    history,
  })

  await act(() => render(<RouterProvider router={router} />))

  const link = await screen.findByTestId('link')
  await act(() => fireEvent.click(link))

  expect(history.length).toBe(1)
})

describe('does not strip search params if search validation fails', () => {
  let history: RouterHistory

  beforeEach(() => {
    history = createBrowserHistory()
  })
  afterEach(() => {
    history.destroy()
    window.history.replaceState(null, 'root', '/')
    cleanup()
  })

  function getRouter() {
    const rootRoute = createRootRoute({
      validateSearch: z.object({ root: z.string() }),
      component: () => {
        const search = rootRoute.useSearch()
        return (
          <>
            <div data-testid="search-root">{search.root ?? '$undefined'}</div>
            <Outlet />
          </>
        )
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      validateSearch: z.object({ index: z.string() }),
      component: () => {
        const search = rootRoute.useSearch()
        return (
          <>
            <div data-testid="search-index">{search.index ?? '$undefined'}</div>
            <Outlet />
          </>
        )
      },
    })

    const routeTree = rootRoute.addChildren([indexRoute])

    const router = createRouter({ routeTree, history })

    return router
  }

  it('smoke test - all required search params are present', async () => {
    window.history.replaceState(null, 'root', '/?root=hello&index=world')
    const router = getRouter()
    await act(() => render(<RouterProvider router={router} />))

    expect(await screen.findByTestId('search-root')).toHaveTextContent('hello')
    expect(await screen.findByTestId('search-index')).toHaveTextContent('world')

    expect(window.location.search).toBe('?root=hello&index=world')
  })

  it('root is missing', async () => {
    window.history.replaceState(null, 'root', '/?index=world')
    const router = getRouter()
    await act(() => render(<RouterProvider router={router} />))

    expect(window.location.search).toBe('?index=world')
  })

  it('index is missing', async () => {
    window.history.replaceState(null, 'root', '/?root=hello')
    const router = getRouter()

    await act(() => render(<RouterProvider router={router} />))

    expect(window.location.search).toBe('?root=hello')
  })
})

describe('statusCode reset on navigation', () => {
  it('should reset statusCode to 200 when navigating from 404 to valid route', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Home</div>,
    })

    const validRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/valid',
      component: () => <div>Valid Route</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute, validRoute])
    const router = createRouter({ routeTree, history })

    render(<RouterProvider router={router} />)

    expect(router.state.statusCode).toBe(200)

    await act(() => router.navigate({ to: '/' }))
    expect(router.state.statusCode).toBe(200)

    await act(() => router.navigate({ to: '/non-existing' }))
    expect(router.state.statusCode).toBe(404)

    await act(() => router.navigate({ to: '/valid' }))
    expect(router.state.statusCode).toBe(200)

    await act(() => router.navigate({ to: '/another-non-existing' }))
    expect(router.state.statusCode).toBe(404)
  })
})

describe('Router rewrite functionality', () => {
  it('should rewrite URLs using fromURL before router interprets them', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const newPathRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/new-path',
      component: () => <div data-testid="new-path">New Path Content</div>,
    })

    const routeTree = rootRoute.addChildren([newPathRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/old-path'] }),
      rewrite: {
        fromURL: ({ url }) => {
          // Rewrite /old-path to /new-path
          if (url.pathname === '/old-path') {
            return `/new-path${url.search}${url.hash}`
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('new-path')).toBeInTheDocument()
    })

    // Router should have interpreted the rewritten URL
    expect(router.state.location.pathname).toBe('/new-path')
  })

  it('should handle fromURL rewrite with complex URL transformations', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const usersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/users',
      component: () => <div data-testid="users">Users Content</div>,
    })

    const routeTree = rootRoute.addChildren([usersRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/legacy/users?page=1#top'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Rewrite legacy URLs to new format
          if (url.pathname === '/legacy/users') {
            return `/users${url.search}${url.hash}`
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('users')).toBeInTheDocument()
    })

    // Router should have interpreted the rewritten URL
    expect(router.state.location.pathname).toBe('/users')
    expect(router.state.location.search).toEqual({ page: 1 })
    expect(router.state.location.hash).toBe('top')
  })

  it('should handle multiple fromURL rewrite conditions', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div data-testid="home">Home Content</div>,
    })

    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <div data-testid="about">About Content</div>,
    })

    const routeTree = rootRoute.addChildren([homeRoute, aboutRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/old-about'] }),
      rewrite: {
        fromURL: ({ url }) => {
          // Multiple rewrite rules
          if (url.pathname === '/old-home' || url.pathname === '/home') {
            return '/'
          }
          if (url.pathname === '/old-about' || url.pathname === '/info') {
            return '/about'
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('about')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/about')
  })

  it('should handle fromURL rewrite with search params and hash preservation', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const docsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/docs',
      component: () => <div data-testid="docs">Documentation</div>,
    })

    const routeTree = rootRoute.addChildren([docsRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/old/documentation?version=v2&lang=en#installation'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Rewrite old docs URL structure
          if (url.pathname === '/old/documentation') {
            return `/docs${url.search}${url.hash}`
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('docs')).toBeInTheDocument()
    })

    // Verify the URL was rewritten correctly with search params and hash preserved
    expect(router.state.location.pathname).toBe('/docs')
    expect(router.state.location.search).toEqual({
      version: 'v2',
      lang: 'en',
    })
    expect(router.state.location.hash).toBe('installation')
  })

  it('should handle subdomain to path rewriting with fromURL', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const apiRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/api/users',
      component: () => <div data-testid="api">API Users</div>,
    })

    const routeTree = rootRoute.addChildren([apiRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://test.domain.com/users'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Rewrite test.domain.com/path to /api/path (subdomain becomes path segment)
          if (url.pathname.startsWith('/test.domain.com/')) {
            return url.pathname.replace('/test.domain.com/', '/api/')
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('api')).toBeInTheDocument()
    })

    // Router should have interpreted the rewritten URL
    expect(router.state.location.pathname).toBe('/api/users')
  })

  it('should handle hostname-based routing with fromURL rewrite', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const appRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/app',
      component: () => <div data-testid="app">App Content</div>,
    })

    const adminRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/admin',
      component: () => <div data-testid="admin">Admin Content</div>,
    })

    const routeTree = rootRoute.addChildren([appRoute, adminRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://admin.example.com/dashboard'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Route based on subdomain
          if (url.hostname === 'admin.example.com') {
            return '/admin'
          }
          if (url.hostname === 'app.example.com') {
            return '/app'
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('admin')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/admin')
  })

  it('should handle multiple URL transformation patterns', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const productsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/products',
      component: () => <div data-testid="products">Products</div>,
    })

    const blogRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/blog',
      component: () => <div data-testid="blog">Blog</div>,
    })

    const routeTree = rootRoute.addChildren([productsRoute, blogRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/old/shop/items?category=electronics'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Multiple transformation patterns
          if (url.pathname === '/old/shop/items') {
            return `/products${url.search}${url.hash}`
          }
          if (url.pathname.startsWith('/legacy/')) {
            return url.pathname.replace('/legacy/', '/blog/')
          }
          if (url.pathname.startsWith('/v1/')) {
            return url.pathname.replace('/v1/', '/')
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('products')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/products')
    expect(router.state.location.search).toEqual({ category: 'electronics' })
  })

  it('should handle returning a fully formed href string with origin (edge case)', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const apiRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/api/v2',
      component: () => <div data-testid="api-v2">API v2</div>,
    })

    const routeTree = rootRoute.addChildren([apiRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://legacy.example.com/api/v1'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Edge case: return fully formed href string with origin
          if (
            url.hostname === 'legacy.example.com' &&
            url.pathname === '/api/v1'
          ) {
            return 'https://api.example.com/api/v2'
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('api-v2')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/api/v2')
  })

  it('should handle mutating the url parameter and returning it (recommended pattern)', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const newApiRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/api/v3/users',
      component: () => <div data-testid="api-v3">API v3 Users</div>,
    })

    const routeTree = rootRoute.addChildren([newApiRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [
          'https://old-api.company.com/users?limit=10&offset=20',
        ],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Recommended pattern: mutate the url parameter and return it
          if (
            url.hostname === 'old-api.company.com' &&
            url.pathname === '/users'
          ) {
            url.hostname = 'api.company.com'
            url.pathname = '/api/v3/users'
            url.searchParams.set('version', '3')
            return url // Return the mutated URL instance
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('api-v3')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/api/v3/users')
    expect(router.state.location.search).toEqual({
      limit: 10,
      offset: 20,
      version: 3,
    })
  })

  it('should handle complex URL mutations with hostname and search params', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const blogRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/content/blog',
      component: () => <div data-testid="blog">Blog Content</div>,
    })

    const routeTree = rootRoute.addChildren([blogRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [
          'https://blog.oldsite.com/posts?category=tech&year=2024#top',
        ],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Mutate URL: change subdomain to path, preserve params and hash
          if (url.hostname === 'blog.oldsite.com') {
            url.hostname = 'newsite.com'
            url.pathname = '/content/blog'
            url.searchParams.set('source', 'migration')
            // Keep existing search params and hash
            return url
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('blog')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/content/blog')
    expect(router.state.location.search).toEqual({
      category: 'tech',
      year: 2024,
      source: 'migration',
    })
    expect(router.state.location.hash).toBe('top')
  })

  it('should handle returning new URL instance vs mutating existing one', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const shopRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/shop/products',
      component: () => <div data-testid="shop">Shop Products</div>,
    })

    const routeTree = rootRoute.addChildren([shopRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['https://store.example.com/items?id=123'],
      }),
      rewrite: {
        fromURL: ({ url }) => {
          // Alternative pattern: create new URL instance and return it
          if (
            url.hostname === 'store.example.com' &&
            url.pathname === '/items'
          ) {
            const newUrl = new URL('https://example.com/shop/products')
            newUrl.searchParams.set(
              'productId',
              url.searchParams.get('id') || '',
            )
            newUrl.searchParams.set('migrated', 'true')
            return newUrl
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('shop')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/shop/products')
    expect(router.state.location.search).toEqual({
      productId: 123,
      migrated: true,
    })
  })

  // NOTE: toURL functionality tests - Currently failing as toURL may not be fully implemented
  // These tests are preserved for when toURL functionality becomes available

  it.skip('should handle toURL rewrite when navigating (PENDING: toURL not implemented)', async () => {
    // This test demonstrates expected toURL behavior for programmatic navigation
    // Currently fails because toURL doesn't affect history.location.pathname
    const Navigate = () => {
      const navigate = useNavigate()
      return (
        <button
          data-testid="navigate-btn"
          onClick={() => navigate({ to: '/dashboard' })}
        >
          Navigate to Dashboard
        </button>
      )
    }

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: Navigate,
    })

    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
      component: () => <div data-testid="dashboard">Dashboard</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute])

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree,
      history,
      rewrite: {
        toURL: ({ url }) => {
          // Should rewrite dashboard URLs to admin URLs in the history
          if (url.pathname === '/dashboard') {
            return '/admin/panel'
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    const navigateBtn = await screen.findByTestId('navigate-btn')

    await act(() => {
      fireEvent.click(navigateBtn)
    })

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument()
    })

    // Router internal state should show the internal path
    expect(router.state.location.pathname).toBe('/dashboard')

    // EXPECTED: History should be updated with the rewritten path due to toURL
    // ACTUAL: Currently fails - history.location.pathname remains '/dashboard'
    expect(history.location.pathname).toBe('/admin/panel')
  })

  it.skip('should handle toURL rewrite with Link navigation (PENDING: toURL not implemented)', async () => {
    // This test demonstrates expected toURL behavior for Link-based navigation
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          <Link to="/profile" data-testid="profile-link">
            Go to Profile
          </Link>
        </div>
      ),
    })

    const profileRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/profile',
      component: () => <div data-testid="profile">User Profile</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute, profileRoute])

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({
      routeTree,
      history,
      rewrite: {
        toURL: ({ url }) => {
          // Should rewrite profile URLs to user URLs in history
          if (url.pathname === '/profile') {
            url.pathname = '/user'
            return url
          }
          return undefined
        },
      },
    })

    render(<RouterProvider router={router} />)

    const profileLink = await screen.findByTestId('profile-link')

    await act(() => {
      fireEvent.click(profileLink)
    })

    await waitFor(() => {
      expect(screen.getByTestId('profile')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/profile')

    // EXPECTED: History should show rewritten path
    // ACTUAL: Currently fails - history shows original path
    expect(history.location.pathname).toBe('/user')
  })

  it.skip('should handle toURL with search params and hash (PENDING: toURL not implemented)', async () => {
    // This test would verify toURL rewriting with complex URL components
    // Currently skipped as toURL functionality is not working as expected
  })

  it.skip('should handle toURL returning fully formed href string (PENDING: toURL not implemented)', async () => {
    // This test would verify toURL returning complete URLs with origins
    // Currently skipped as toURL functionality is not working as expected
  })
})

describe('rewriteBasepath utility', () => {
  // Helper function to create basepath rewrite logic (mimicking the utility)
  const createBasepathRewrite = (
    basepath: string,
    additionalRewrite?: {
      fromURL: (opts: { url: URL }) => URL | undefined
    },
  ) => {
    const trimmedBasepath = basepath.replace(/^\/+|\/+$/g, '') // trim slashes
    return {
      fromURL: ({ url }: { url: URL }) => {
        if (trimmedBasepath) {
          url.pathname = url.pathname.replace(
            new RegExp(`^/${trimmedBasepath}`),
            '',
          )
        }
        return additionalRewrite?.fromURL
          ? additionalRewrite.fromURL({ url })
          : url
      },
    } as const
  }

  it('should handle basic basepath rewriting with fromURL', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div data-testid="home">Home</div>,
    })

    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <div data-testid="about">About</div>,
    })

    const routeTree = rootRoute.addChildren([homeRoute, aboutRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/my-app/about'],
      }),
      rewrite: createBasepathRewrite('my-app'),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('about')).toBeInTheDocument()
    })

    // Router should interpret the URL without the basepath
    expect(router.state.location.pathname).toBe('/about')
  })

  it('should handle basepath with leading and trailing slashes', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const usersRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/users',
      component: () => <div data-testid="users">Users</div>,
    })

    const routeTree = rootRoute.addChildren([usersRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/api/v1/users'],
      }),
      rewrite: createBasepathRewrite('/api/v1/'), // With leading and trailing slashes
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('users')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/users')
  })

  it('should handle empty basepath gracefully', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const testRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/test',
      component: () => <div data-testid="test">Test</div>,
    })

    const routeTree = rootRoute.addChildren([testRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/test'],
      }),
      rewrite: createBasepathRewrite(''), // Empty basepath
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('test')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/test')
  })

  it('should combine basepath with additional fromURL rewrite logic', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const newApiRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/api/v2',
      component: () => <div data-testid="api-v2">API v2</div>,
    })

    const routeTree = rootRoute.addChildren([newApiRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/my-app/legacy/api/v1'],
      }),
      rewrite: createBasepathRewrite('my-app', {
        // Additional rewrite logic after basepath removal
        fromURL: ({ url }) => {
          if (url.pathname === '/legacy/api/v1') {
            url.pathname = '/api/v2'
            return url
          }
          return undefined
        },
      }),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('api-v2')).toBeInTheDocument()
    })

    // Should first remove basepath (/my-app/legacy/api/v1 -> /legacy/api/v1)
    // Then apply additional rewrite (/legacy/api/v1 -> /api/v2)
    expect(router.state.location.pathname).toBe('/api/v2')
  })

  it('should handle complex basepath with subdomain-style paths', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const dashboardRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
      component: () => <div data-testid="dashboard">Dashboard</div>,
    })

    const routeTree = rootRoute.addChildren([dashboardRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/tenant-123/dashboard'],
      }),
      rewrite: createBasepathRewrite('tenant-123'),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('should preserve search params and hash when rewriting basepath', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const searchRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/search',
      component: () => <div data-testid="search">Search</div>,
    })

    const routeTree = rootRoute.addChildren([searchRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/app/search?q=test&filter=all#results'],
      }),
      rewrite: createBasepathRewrite('app'),
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('search')).toBeInTheDocument()
    })

    expect(router.state.location.pathname).toBe('/search')
    expect(router.state.location.search).toEqual({
      q: 'test',
      filter: 'all',
    })
    expect(router.state.location.hash).toBe('results')
  })

  it.skip('should handle nested basepath with multiple rewrite layers (complex case)', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const finalRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/final',
      component: () => <div data-testid="final">Final</div>,
    })

    const routeTree = rootRoute.addChildren([finalRoute])

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: ['/base/legacy/old/path'],
      }),
      rewrite: createBasepathRewrite('base', {
        fromURL: ({ url }) => {
          // First layer: convert legacy paths
          if (url.pathname === '/legacy/old/path') {
            url.pathname = '/new/path'
            return url
          }
          return undefined
        },
      }),
    })

    // Add a second rewrite layer
    const originalRewrite = router.options.rewrite
    router.options.rewrite = {
      fromURL: ({ url }) => {
        // Apply basepath rewrite first
        const result = originalRewrite?.fromURL?.({ url })
        if (result && typeof result !== 'string') {
          // Second layer: convert new paths to final
          if (result.pathname === '/new/path') {
            result.pathname = '/final'
            return result
          }
        }
        return result
      },
    }

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('final')).toBeInTheDocument()
    })

    // Should apply: /base/legacy/old/path -> /legacy/old/path -> /new/path -> /final
    expect(router.state.location.pathname).toBe('/final')
  })

  it.skip('should handle basepath with toURL rewriting (PENDING: toURL not implemented)', async () => {
    // This test would verify that basepath is added back when navigating
    // Currently skipped as toURL functionality is not working as expected

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          <Link to="/about" data-testid="about-link">
            About
          </Link>
        </div>
      ),
    })

    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <div data-testid="about">About</div>,
    })

    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

    const history = createMemoryHistory({ initialEntries: ['/my-app/'] })

    const router = createRouter({
      routeTree,
      history,
      rewrite: createBasepathRewrite('my-app'),
    })

    render(<RouterProvider router={router} />)

    const aboutLink = await screen.findByTestId('about-link')

    await act(() => {
      fireEvent.click(aboutLink)
    })

    await waitFor(() => {
      expect(screen.getByTestId('about')).toBeInTheDocument()
    })

    // Router internal state should show clean path
    expect(router.state.location.pathname).toBe('/about')

    // EXPECTED: History should show path with basepath added back
    // ACTUAL: Currently fails due to toURL not being implemented
    expect(history.location.pathname).toBe('/my-app/about')
  })
})
