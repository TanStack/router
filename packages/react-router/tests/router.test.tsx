import { act, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { AnyRoute, RouterOptions } from '../src'

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const mockFn1 = vi.fn()

function createTestRouter(options?: RouterOptions<AnyRoute, 'never'>) {
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

  const routeTree = rootRoute.addChildren([
    indexRoute,
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
  it('state.location.pathname, should have the params.slug value of "tanner"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/tanner'] }),
    })

    await act(() => router.load())

    expect(router.state.location.pathname).toBe('/posts/tanner')
  })

  it('state.location.pathname, should have the params.slug value of "🚀"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/🚀'] }),
    })

    await act(() => router.load())

    expect(router.state.location.pathname).toBe('/posts/🚀')
  })

  it('state.location.pathname, should have the params.slug value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/posts/%F0%9F%9A%80'] }),
    })

    await act(() => router.load())

    expect(router.state.location.pathname).toBe('/posts/%F0%9F%9A%80')
  })

  it('state.location.pathname, should have the params.slug value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: [
          '/posts/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
        ],
      }),
    })

    await act(() => router.load())

    expect(router.state.location.pathname).toBe(
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
})

describe('encoding: URL splat segment for /$', () => {
  it('state.location.pathname, should have the params._splat value of "tanner"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/tanner'] }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/tanner')
  })

  it('state.location.pathname, should have the params._splat value of "🚀"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/🚀'] }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/🚀')
  })

  it('state.location.pathname, should have the params._splat value of "%F0%9F%9A%80"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/%F0%9F%9A%80'] }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/%F0%9F%9A%80')
  })

  it('state.location.pathname, should have the params._splat value of "framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: [
          '/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
        ],
      }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe(
      '/framework%2Freact%2Fguide%2Ffile-based-routing%20tanstack',
    )
  })

  it('state.location.pathname, should have the params._splat value of "framework/react/guide/file-based-routing tanstack"', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({
        initialEntries: ['/framework/react/guide/file-based-routing tanstack'],
      }),
    })

    await router.load()

    expect(router.state.location.pathname).toBe(
      '/framework/react/guide/file-based-routing tanstack',
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
      output: '/path-segment/é',
      type: 'encoded',
    },
    {
      input: '/path-segment/é',
      output: '/path-segment/é',
      type: 'not encoded',
    },
    {
      input: '/path-segment/%F0%9F%9A%80',
      output: '/path-segment/🚀',
      type: 'encoded',
    },
    {
      input: '/path-segment/%F0%9F%9A%80to%2Fthe%2Fmoon',
      output: '/path-segment/🚀to%2Fthe%2Fmoon',
      type: 'encoded',
    },
    {
      input: '/path-segment/🚀',
      output: '/path-segment/🚀',
      type: 'not encoded',
    },
    {
      input: '/path-segment/🚀to%2Fthe%2Fmoon',
      output: '/path-segment/🚀to%2Fthe%2Fmoon',
      type: 'not encoded',
    },
  ])(
    'should resolve $input to $output when the path segment is $type',
    async ({ input, output }) => {
      const { router } = createTestRouter({
        history: createMemoryHistory({ initialEntries: [input] }),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      expect(router.state.location.pathname).toBe(output)
    },
  )
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
    render(<RouterProvider router={router} />)

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
  it('should not remount the page component when navigating to the same route', async () => {
    const callerMock = vi.fn()

    const rootRoute = createRootRoute({
      component: () => {
        return (
          <div>
            <p>Root</p>
            <div>
              <Link to="/foo/$id" params={{ id: '1' }}>
                Foo1
              </Link>
              <Link to="/foo/$id" params={{ id: '2' }}>
                Foo2
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
      path: '/foo/$id',
      component: FooIdRouteComponent,
    })
    function FooIdRouteComponent() {
      const id = fooIdRoute.useParams({ select: (s) => s.id })

      useEffect(() => {
        callerMock()
      }, [])

      return <div>Foo page {id}</div>
    }

    const routeTree = rootRoute.addChildren([fooIdRoute, indexRoute])
    const router = createRouter({ routeTree })

    render(<RouterProvider router={router} />)

    const foo1Link = await screen.findByRole('link', { name: 'Foo1' })
    const foo2Link = await screen.findByRole('link', { name: 'Foo2' })

    expect(foo1Link).toBeInTheDocument()
    expect(foo2Link).toBeInTheDocument()

    fireEvent.click(foo1Link)

    const fooPage1 = await screen.findByText('Foo page 1')
    expect(fooPage1).toBeInTheDocument()

    expect(callerMock).toBeCalledTimes(1)

    fireEvent.click(foo2Link)

    const fooPage2 = await screen.findByText('Foo page 2')
    expect(fooPage2).toBeInTheDocument()

    expect(callerMock).toBeCalledTimes(1)
  })
})

describe('transformer functions are defined', () => {
  it('should have default transformer functions', () => {
    const rootRoute = createRootRoute({})
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({ routeTree })

    expect(router.options.transformer.parse).toBeInstanceOf(Function)
    expect(router.options.transformer.stringify).toBeInstanceOf(Function)
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

  it('layout splat route matches without splat', async () => {
    const { router } = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/layout-splat'] }),
    })

    await act(() => router.load())

    expect(router.state.matches.map((d) => d.routeId)).toEqual([
      '__root__',
      '/layout-splat',
      '/layout-splat/',
    ])
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
          const { router } = createTestRouter({ search: { strict } })
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
          expect(router.state.location.search).toEqual(search)
          const parsedSearch = new URLSearchParams(window.location.search)
          expect(parsedSearch.size).toBe(Object.keys(search).length)
          for (const [key, value] of Object.entries(search)) {
            expect(parsedSearch.get(key)).toBe(value)
          }
        },
      )
    },
  )

  describe('removes unknown search params in the URL when search.strict=true', () => {
    it.each(testCases)('%j', async ({ route, search }) => {
      const { router } = createTestRouter({ search: { strict: true } })
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
      const expectedSearch = { ...search }
      delete expectedSearch.unknown
      expect(router.state.location.search).toEqual(expectedSearch)
      const parsedSearch = new URLSearchParams(window.location.search)
      expect(parsedSearch.size).toBe(Object.keys(expectedSearch).length)
      for (const [key, value] of Object.entries(expectedSearch)) {
        expect(parsedSearch.get(key)).toBe(value)
      }
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
