import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.useRealTimers()
})

describe('client loading contracts', () => {
  test('completed preloads cache loader data without caching beforeLoad context', async () => {
    let beforeLoadGeneration = 0
    const loader = vi.fn(
      ({ context }: { context: { generation: number } }) => context.generation,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      context: () => ({ routeContext: true }),
      beforeLoad: () => ({ generation: ++beforeLoadGeneration }),
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preloaded = await router.preloadRoute({ to: '/target' })

    expect(preloaded?.at(-1)?.context).toEqual({
      routeContext: true,
      generation: 1,
    })

    await router.navigate({ to: '/target' })

    expect(router.state.matches.at(-1)?.context).toEqual({
      routeContext: true,
      generation: 2,
    })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)
  })

  test('navigation owns beforeLoad for equivalent Date search', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      await beforeLoadGate
      return { source: preload ? 'preload' : 'navigation' }
    })
    const loader = vi.fn(() => 'loader data')
    const parseSearch = (searchStr: string) => {
      const day = new URLSearchParams(searchStr).get('day')
      return day ? { day: new Date(day) } : {}
    }
    const stringifySearch = (search: Record<string, unknown>) => {
      const day = search.day
      return day instanceof Date
        ? `?day=${encodeURIComponent(day.toISOString())}`
        : ''
    }
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        day:
          search.day instanceof Date
            ? search.day
            : new Date(String(search.day)),
      }),
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      parseSearch,
      stringifySearch,
    })
    const iso = '2026-07-24T10:00:00.000Z'
    const options = () => ({
      to: '/target' as const,
      search: { day: new Date(iso) },
    })
    const preloadOptions = options()
    const navigationOptions = options()

    expect(preloadOptions.search.day).not.toBe(navigationOptions.search.day)

    await router.load()
    const preload = router.preloadRoute(preloadOptions)
    let navigation: ReturnType<typeof router.navigate> | undefined

    try {
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledOnce())

      navigation = router.navigate(navigationOptions)
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

      beforeLoadGate.resolve()
      await Promise.all([preload, navigation])

      expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual(
        [true, false],
      )
      expect(loader).toHaveBeenCalledOnce()
      expect(router.state.location.search).toEqual({ day: new Date(iso) })
      expect(router.state.matches.at(-1)).toMatchObject({
        context: { source: 'navigation' },
        loaderData: 'loader data',
      })
    } finally {
      beforeLoadGate.resolve()
      await Promise.allSettled([preload, navigation])
    }
  })

  test('identical preloads rerun beforeLoad and share the redirected loader', async () => {
    const redirectGate = createControlledPromise<void>()
    const loaderGate = createControlledPromise<void>()
    const sourceBeforeLoad = vi.fn(async () => {
      await redirectGate
      throw redirect({ to: '/target' })
    })
    const redirectedLoader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: sourceBeforeLoad,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: redirectedLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const first = router.preloadRoute({ to: '/source' })
    const second = router.preloadRoute({ to: '/source' })
    await vi.waitFor(() => expect(sourceBeforeLoad).toHaveBeenCalledTimes(2))
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })

    redirectGate.resolve()
    await vi.waitFor(() => expect(redirectedLoader).toHaveBeenCalledOnce())
    expect(secondSettled).toBe(false)

    loaderGate.resolve()
    await Promise.all([first, second])
    expect(secondSettled).toBe(true)
  })

  test('an unrelated navigation does not stop a preload redirect chain', async () => {
    const redirectGate = createControlledPromise<void>()
    const navigationGate = createControlledPromise<void>()
    const targetGate = createControlledPromise<string>()
    const sourceBeforeLoad = vi.fn(async () => {
      await redirectGate
      throw redirect({ to: '/target' })
    })
    const navigationBeforeLoad = vi.fn(() => navigationGate)
    const targetLoader = vi.fn(() => targetGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      beforeLoad: sourceBeforeLoad,
    })
    const navigationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/navigation',
      beforeLoad: navigationBeforeLoad,
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader: targetLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        sourceRoute,
        navigationRoute,
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const first = router.preloadRoute({ to: '/source' })
    await vi.waitFor(() => expect(sourceBeforeLoad).toHaveBeenCalledOnce())

    const navigation = router.navigate({ to: '/navigation' })
    await vi.waitFor(() => expect(navigationBeforeLoad).toHaveBeenCalledOnce())

    expect(sourceBeforeLoad).toHaveBeenCalledOnce()

    redirectGate.resolve()
    await vi.waitFor(() => expect(targetLoader).toHaveBeenCalledOnce())

    targetGate.resolve('target')
    const firstResult = await first
    expect(firstResult?.at(-1)?.routeId).toBe(targetRoute.id)

    navigationGate.resolve()
    await navigation
  })

  test.each([
    {
      name: 'route suffix',
      preload: { to: '/items/one/first' },
      navigation: { to: '/items/one/second' },
      pathname: '/items/one/second',
      search: {},
    },
    {
      name: 'params',
      preload: { to: '/items/one/first' },
      navigation: { to: '/items/two/first' },
      pathname: '/items/two/first',
      search: {},
    },
    {
      name: 'search',
      preload: {
        to: '/items/one/first',
        search: { view: 'summary' },
      },
      navigation: {
        to: '/items/one/first',
        search: { view: 'detail' },
      },
      pathname: '/items/one/first',
      search: { view: 'detail' },
    },
  ])(
    'navigation owns beforeLoad with a different $name than an active preload',
    async ({
      preload: preloadOptions,
      navigation: navigationOptions,
      pathname,
      search,
    }) => {
      const beforeLoadGate = createControlledPromise<void>()
      const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
        await beforeLoadGate
        return { preload }
      })
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const itemsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/items/$itemId',
        beforeLoad,
      })
      const firstRoute = new BaseRoute({
        getParentRoute: () => itemsRoute,
        path: '/first',
      })
      const secondRoute = new BaseRoute({
        getParentRoute: () => itemsRoute,
        path: '/second',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          itemsRoute.addChildren([firstRoute, secondRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      const preload = router.preloadRoute(preloadOptions as any)
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

      const navigation = router.navigate(navigationOptions as any)
      await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

      beforeLoadGate.resolve()
      await Promise.all([preload, navigation])

      expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual(
        [true, false],
      )
      expect(router.state.location.pathname).toBe(pathname)
      expect(router.state.location.search).toEqual(search)
      expect(router.state.matches.at(-1)?.context).toEqual({ preload: false })
    },
  )

  test('equivalent serialized Date loader deps reuse stale-infinite data', async () => {
    const loader = vi.fn(({ deps }: { deps: { day: Date } }) =>
      deps.day.toISOString(),
    )
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      staleTime: Infinity,
      validateSearch: (search: Record<string, unknown>) => ({
        day: String(search.day),
        layout: search.layout === 'grid' ? 'grid' : 'list',
      }),
      loaderDeps: ({ search }) => ({
        day: new Date(`${search.day}T00:00:00.000Z`),
      }),
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?day=2026-07-24&layout=list'],
      }),
    })

    await router.load()
    await router.navigate({
      to: '/target',
      search: { day: '2026-07-24', layout: 'grid' },
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.location.search).toMatchObject({ layout: 'grid' })
    expect(router.state.matches.at(-1)?.loaderData).toBe(
      '2026-07-24T00:00:00.000Z',
    )
  })

  test('a sibling navigation reruns beforeLoad but reuses the pending parent loader', async () => {
    const loaderGate = createControlledPromise<string>()
    let loaderSignal: AbortSignal | undefined
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    const loader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        loaderSignal = abortController.signal
        return loaderGate
      },
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(1)
    loaderGate.resolve('shared parent data')
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'shared parent data',
    })
    expect(loaderSignal?.aborted).toBe(false)

    await router.navigate({ to: '/' })
    expect(loaderSignal?.aborted).toBe(true)
  })

  test('a sibling navigation reuses parent data that settles while its beforeLoad is pending', async () => {
    const loaderGate = createControlledPromise<string>()
    const navigationBeforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (!preload) {
        await navigationBeforeLoadGate
      }
      return { source: preload ? 'preload' : 'navigation' }
    })
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    loaderGate.resolve('shared parent data')
    await preload
    expect(loader).toHaveBeenCalledTimes(1)

    navigationBeforeLoadGate.resolve()
    await navigation

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'shared parent data',
    })
  })

  test('a background shouldReload navigation starts fresh instead of joining a pending preload loader', async () => {
    const preloadRefreshGate = createControlledPromise<string>()
    const navigationRefreshGate = createControlledPromise<string>()
    const navigationBeforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(
      async ({
        preload,
        search,
      }: {
        preload: boolean
        search: { revision: number }
      }) => {
        if (!preload && search.revision === 2) {
          await navigationBeforeLoadGate
        }
        return { source: preload ? 'preload' : 'navigation' }
      },
    )
    const loader = vi.fn(({ preload }: { preload: boolean }) => {
      if (preload) {
        return preloadRefreshGate
      }
      return loader.mock.calls.length === 1
        ? 'initial data'
        : navigationRefreshGate
    })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 0),
      }),
      beforeLoad,
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision > 0,
      loader: {
        handler: loader,
        staleReloadMode: 'background',
      },
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/parent/first?revision=0'],
      }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/parent/first',
      search: { revision: 1 },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    let navigationSettled = false
    const navigation = router
      .navigate({
        to: '/parent/second',
        search: { revision: 2 },
      })
      .then(() => {
        navigationSettled = true
      })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(3))

    preloadRefreshGate.resolve('preload refreshed data')
    await preload
    expect(loader).toHaveBeenCalledTimes(2)
    expect(navigationSettled).toBe(false)

    navigationBeforeLoadGate.resolve()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3))
    navigationRefreshGate.resolve('navigation refreshed data')
    await navigation
    await vi.waitFor(() => {
      expect(
        router.state.matches.find(
          (match) => match.routeId === parentRoute.id,
        )?.loaderData,
      ).toBe('navigation refreshed data')
    })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      false,
      true,
      false,
    ])
    expect(loader.mock.calls.map(([context]) => context.preload)).toEqual([
      false,
      true,
      false,
    ])
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'navigation refreshed data',
      preload: false,
      isFetching: false,
    })
  })

  test('a sibling preload reruns beforeLoad but reuses the pending parent loader', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const first = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.preloadRoute({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(1)
    loaderGate.resolve('shared parent data')
    const [firstMatches, secondMatches] = await Promise.all([first, second])

    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      firstMatches?.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('shared parent data')
    expect(
      secondMatches?.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('shared parent data')
  })

  test('sibling lanes reuse a pending stale parent refresh', async () => {
    const refreshGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() =>
      loader.mock.calls.length === 1 ? 'initial data' : refreshGate,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preloadStaleTime: 0,
      beforeLoad,
      loader: {
        handler: loader,
        staleReloadMode: 'blocking',
      },
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const thirdRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/third',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute, thirdRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/first' })
    const refresh = router.preloadRoute({ to: '/parent/second' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))

    const navigation = router.navigate({ to: '/parent/third' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(3))
    expect(loader).toHaveBeenCalledTimes(2)

    refreshGate.resolve('refreshed data')
    await Promise.all([refresh, navigation])

    expect(loader).toHaveBeenCalledTimes(2)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.loaderData,
    ).toBe('refreshed data')
  })

  test('a sibling navigation shares a pending parent loader failure', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.reject(new Error('preload failed'))
    await Promise.all([preload, navigation])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id),
    ).toMatchObject({
      status: 'error',
      error: expect.objectContaining({ message: 'preload failed' }),
    })
  })

  test('sibling lanes share one pending parent loader failure', async () => {
    const firstLoaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => firstLoaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader,
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/first',
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/second',
    })
    const thirdRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/third',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([firstRoute, secondRoute, thirdRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const first = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())
    const second = router.preloadRoute({ to: '/parent/second' })
    const third = router.preloadRoute({ to: '/parent/third' })
    await Promise.resolve()
    expect(loader).toHaveBeenCalledOnce()

    firstLoaderGate.reject(new Error('first generation failed'))
    const [, secondMatches, thirdMatches] = await Promise.all([
      first,
      second,
      third,
    ])

    expect(loader).toHaveBeenCalledOnce()
    for (const matches of [secondMatches, thirdMatches]) {
      expect(
        matches?.find((match) => match.routeId === parentRoute.id),
      ).toMatchObject({
        status: 'error',
        error: expect.objectContaining({ message: 'first generation failed' }),
      })
    }
  })

  test('completed preloads reuse same-id route context and loader data', async () => {
    const context = ({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    })
    const loader = vi.fn(
      ({ context: value }: { context: { source: string } }) => value.source,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      context,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      context: { source: 'preload' },
      loaderData: 'preload',
    })
  })

  test('navigation succeeds independently of a failed preload beforeLoad', async () => {
    const preloadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (preload) {
        await preloadGate
        throw new Error('preload failed')
      }
      return { source: 'navigation' }
    })
    const loader = vi.fn(() => 'navigation data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))
    const navigation = router.navigate({ to: '/target' })

    preloadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      context: { source: 'navigation' },
      loaderData: 'navigation data',
    })
  })

  test('a later retry reuses successful loader data from a failed preload lane', async () => {
    const childGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    let parentSignal: AbortSignal | undefined
    const parentLoader = vi.fn(({ abortController }) => {
      parentSignal = abortController.signal
      return 'parent data'
    })
    const childLoader = vi.fn(async ({ preload }: { preload: boolean }) => {
      if (preload) {
        await childGate
        throw new Error('preload child failed')
      }
      return 'child data'
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/child' })
    await vi.waitFor(() => expect(childLoader).toHaveBeenCalledTimes(1))

    childGate.resolve()
    await preload
    await router.navigate({ to: '/parent/child' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(parentSignal?.aborted).toBe(false)
    expect(childLoader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      status: 'success',
      loaderData: 'child data',
    })
  })

  test('a terminal preload stays terminal publicly while caching its successful loader generation', async () => {
    const loader = vi.fn(
      ({ deps }: { deps: { version: number } }) => deps.version,
    )
    const rootRoute = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version ?? 0),
      }),
      loaderDeps: ({ search }) => ({ version: search.version }),
      shouldReload: false,
      loader,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad: () => {
        throw notFound({ routeId: rootRoute.id as never })
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/?version=0'],
      }),
    })

    await router.load()
    const terminal = await router.preloadRoute({
      to: '/target',
      search: { version: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(terminal).toHaveLength(2)
    expect(terminal?.[0]).toMatchObject({
      routeId: rootRoute.id,
      status: 'success',
      _notFound: true,
      error: { isNotFound: true },
      loaderData: 1,
    })
    expect(terminal?.[1]).toMatchObject({
      routeId: targetRoute.id,
      status: 'pending',
    })

    await router.navigate({
      to: '/target',
      search: { version: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches[0]).toMatchObject({
      status: 'success',
      _notFound: true,
      loaderData: 1,
    })
    expect(router.state.matches[1]).toMatchObject({
      routeId: targetRoute.id,
      status: 'pending',
    })
  })

  test('a terminal preload with shouldReload starts fresh instead of joining a pending navigation loader', async () => {
    const navigationLoaderGate = createControlledPromise<string>()
    const preloadLoaderGate = createControlledPromise<string>()
    const loader = vi.fn(({ preload }: { preload: boolean }) => {
      if (loader.mock.calls.length === 1) {
        return 'initial data'
      }
      return preload ? preloadLoaderGate : navigationLoaderGate
    })
    const rootRoute = new BaseRootRoute({
      shouldReload: true,
      loader,
    })
    const beforeLoad = vi.fn(() => {
      throw notFound({ routeId: rootRoute.id as never })
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    const preload = router.preloadRoute({ to: '/target' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3))

    navigationLoaderGate.resolve('navigation data')
    await navigation
    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      loaderData: 'navigation data',
    })

    preloadLoaderGate.resolve('preload data')
    const terminal = await preload

    expect(loader.mock.calls.map(([context]) => context.preload)).toEqual([
      false,
      false,
      true,
    ])
    expect(terminal?.[0]).toMatchObject({
      routeId: rootRoute.id,
      _notFound: true,
      loaderData: 'preload data',
    })

    expect(router.state.matches[0]).toMatchObject({
      routeId: rootRoute.id,
      _notFound: true,
      loaderData: 'navigation data',
    })
  })

  test('leaving a route preserves its newer same-id preload generation', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await router.navigate({ to: '/' })
    await router.navigate({
      to: '/target',
      search: { revision: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 2')
  })

  test('an expired same-id preload does not displace fresh unloaded data', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2,
      preloadGcTime: 0,
      gcTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    await router.navigate({ to: '/' })
    await router.navigate({
      to: '/target',
      search: { revision: 1 },
    })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 1')
  })

  test('filtered invalidation invalidates committed and cached generations of the selected route', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      preloadGcTime: Infinity,
      gcTime: Infinity,
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      loaderDeps: ({ search }) => ({ revision: search.revision }),
      loader: {
        staleReloadMode: 'blocking',
        handler: loader,
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([targetRoute]),
      history: createMemoryHistory({
        initialEntries: ['/target?revision=1'],
      }),
    })

    await router.load()
    await router.preloadRoute({
      to: '/target',
      search: { revision: 2 },
    })
    expect(loader).toHaveBeenCalledTimes(2)

    await router.invalidate({
      filter: (match) => match.routeId === targetRoute.id,
    })

    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 3')

    await router.navigate({
      to: '/target',
      search: { revision: 2 },
    })

    expect(loader).toHaveBeenCalledTimes(4)
    expect(router.state.matches.at(-1)).toMatchObject({
      invalid: false,
      loaderData: 'loader data 4',
      search: { revision: 2 },
    })
  })

  test('a hidden terminal suffix does not evict a newer same-id preload', async () => {
    const failingBeforeLoadStarted = createControlledPromise<void>()
    const failingBeforeLoadGate = createControlledPromise<void>()
    const loader = vi.fn(() => 'preloaded child data')
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      validateSearch: (search: Record<string, unknown>) => ({
        fail: search.fail === true,
      }),
      beforeLoad: async ({ search }) => {
        if (search.fail) {
          failingBeforeLoadStarted.resolve()
          await failingBeforeLoadGate
          throw new Error('parent failed')
        }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      staleTime: Infinity,
      preloadStaleTime: Infinity,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const failingNavigation = router.navigate({
      to: '/parent/child',
      search: { fail: true },
    })
    await failingBeforeLoadStarted

    await router.preloadRoute({
      to: '/parent/child',
      search: { fail: false },
    })
    expect(loader).toHaveBeenCalledTimes(1)

    failingBeforeLoadGate.resolve()
    await failingNavigation
    expect(router.state.matches).toHaveLength(3)
    expect(router.state.matches[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
    })

    await router.navigate({
      to: '/parent/child',
      search: { fail: false },
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      loaderData: 'preloaded child data',
    })
  })

  test('preload false skips only that match while navigation loads it normally', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const componentPreload = vi.fn(async () => {})
    const pendingComponentPreload = vi.fn(async () => {})
    const component = Object.assign(() => null, {
      preload: componentPreload,
    })
    const pendingComponent = Object.assign(() => null, {
      preload: pendingComponentPreload,
    })
    const lazyFn = vi.fn(async () => ({ options: {} }) as any)
    const childLoader = vi.fn(() => 'child data')
    const childComponentPreload = vi.fn(async () => {})
    const childPendingComponentPreload = vi.fn(async () => {})
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preload: false,
      component,
      pendingComponent,
      loader,
    }).lazy(lazyFn)
    const childRoute = new BaseRoute({
      getParentRoute: () => targetRoute,
      path: '/child',
      preloadStaleTime: Infinity,
      component: Object.assign(() => null, {
        preload: childComponentPreload,
      }),
      pendingComponent: Object.assign(() => null, {
        preload: childPendingComponentPreload,
      }),
      loader: childLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        targetRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target/child' })

    expect(loader).not.toHaveBeenCalled()
    expect(lazyFn).not.toHaveBeenCalled()
    expect(componentPreload).not.toHaveBeenCalled()
    expect(pendingComponentPreload).not.toHaveBeenCalled()
    expect(childLoader).toHaveBeenCalledOnce()
    expect(childComponentPreload).toHaveBeenCalledOnce()
    expect(childPendingComponentPreload).toHaveBeenCalledOnce()

    let settled = false
    const navigation = router.navigate({ to: '/target/child' }).then(() => {
      settled = true
    })
    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledOnce()
      expect(lazyFn).toHaveBeenCalledOnce()
      expect(componentPreload).toHaveBeenCalledOnce()
      expect(pendingComponentPreload).toHaveBeenCalledOnce()
    })
    expect(settled).toBe(false)

    loaderGate.resolve('target data')
    await navigation

    expect(router.state.matches.at(-2)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target data',
    })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: childRoute.id,
      loaderData: 'child data',
    })
    expect(childLoader).toHaveBeenCalledOnce()
  })

  test('a descendant background redirect beats an ancestor chunk failure', async () => {
    const componentGate = createControlledPromise<void>()
    const componentStarted = createControlledPromise<void>()
    const redirectGate = createControlledPromise<void>()
    const redirectStarted = createControlledPromise<void>()
    const chunkError = new Error('parent component failed')
    let childLoads = 0

    const ParentComponent = Object.assign(() => null, {
      preload: () => {
        componentStarted.resolve()
        return componentGate
      },
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preload: false,
      component: ParentComponent,
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      shouldReload: true,
      loader: {
        staleReloadMode: 'background',
        handler: async () => {
          childLoads++
          if (childLoads === 1) {
            return 'preloaded child data'
          }
          redirectStarted.resolve()
          await redirectGate
          throw redirect({ to: '/target' })
        },
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' })
    expect(componentStarted.status).toBe('pending')
    expect(childLoads).toBe(1)

    const navigation = router.navigate({ to: '/parent/child' })
    await Promise.all([componentStarted, redirectStarted])
    redirectGate.resolve()
    componentGate.reject(chunkError)
    await navigation

    expect(router.state.location.pathname).toBe('/target')
  })

  test('a background redirect beats a descendant notFound targeted to its ancestor', async () => {
    const redirectGate = createControlledPromise<void>()
    const redirectStarted = createControlledPromise<void>()
    const notFoundGate = createControlledPromise<void>()
    const notFoundStarted = createControlledPromise<void>()
    let middleLoads = 0

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      notFoundComponent: () => null,
    })
    const middleRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/middle',
      shouldReload: true,
      loader: {
        staleReloadMode: 'background',
        handler: async () => {
          middleLoads++
          if (middleLoads === 1) {
            return 'preloaded middle data'
          }
          redirectStarted.resolve()
          await redirectGate
          throw redirect({ to: '/target' })
        },
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => middleRoute,
      path: '/child',
      preload: false,
      loader: async () => {
        notFoundStarted.resolve()
        await notFoundGate
        throw notFound({ routeId: parentRoute.id as never })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([
          middleRoute.addChildren([childRoute]),
        ]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/middle/child' })
    expect(middleLoads).toBe(1)
    expect(notFoundStarted.status).toBe('pending')

    const navigation = router.navigate({ to: '/parent/middle/child' })
    await Promise.all([redirectStarted, notFoundStarted])
    redirectGate.resolve()
    notFoundGate.resolve()
    await navigation

    expect(router.state.location.pathname).toBe('/target')
  })

  test('preload false skips a serial error boundary chunk until navigation', async () => {
    const error = new Error('target failed')
    const context = vi.fn(() => ({ targetContext: true }))
    const beforeLoad = vi.fn(() => {
      throw error
    })
    const lazyFn = vi.fn(async () => ({ options: {} }) as any)
    const errorComponentPreload = vi.fn(async () => {})
    const errorComponent = Object.assign(() => null, {
      preload: errorComponentPreload,
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preload: false,
      context,
      beforeLoad,
      errorComponent,
    }).lazy(lazyFn)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preloaded = await router.preloadRoute({ to: '/target' })

    expect(context).toHaveBeenCalledOnce()
    expect(beforeLoad).toHaveBeenCalledOnce()
    expect(lazyFn).not.toHaveBeenCalled()
    expect(errorComponentPreload).not.toHaveBeenCalled()
    expect(preloaded?.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'error',
      error,
    })

    await router.navigate({ to: '/target' })

    expect(context).toHaveBeenCalledTimes(2)
    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(lazyFn).toHaveBeenCalledOnce()
    expect(errorComponentPreload).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'error',
      error,
    })
  })

  test('preload false skips its serial not-found boundary chunks', async () => {
    const context = vi.fn(() => ({ targetContext: true }))
    const lazyFn = vi.fn(async () => ({ options: {} }) as any)
    const notFoundComponentPreload = vi.fn(async () => {})
    const notFoundComponent = Object.assign(() => null, {
      preload: notFoundComponentPreload,
    })
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preload: false,
      context,
      beforeLoad: () => {
        throw notFound({ routeId: targetRoute.id as never })
      },
      notFoundComponent,
    }).lazy(lazyFn)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preloaded = await router.preloadRoute({ to: '/target' })

    expect(context).toHaveBeenCalledOnce()
    expect(lazyFn).not.toHaveBeenCalled()
    expect(notFoundComponentPreload).not.toHaveBeenCalled()
    expect(preloaded?.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'notFound',
      error: { isNotFound: true },
    })

    await router.navigate({ to: '/target' })

    expect(context).toHaveBeenCalledTimes(2)
    expect(lazyFn).toHaveBeenCalledOnce()
    expect(notFoundComponentPreload).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'notFound',
      error: { isNotFound: true },
    })
  })

  test('preload false still permits an enabled ancestor not-found boundary', async () => {
    const targetLazyFn = vi.fn(async () => ({ options: {} }) as any)
    const parentNotFoundPreload = vi.fn(async () => {})
    const ParentNotFound = Object.assign(() => null, {
      preload: parentNotFoundPreload,
    })
    const parentLazyFn = vi.fn(
      async () => ({ options: { notFoundComponent: ParentNotFound } }) as any,
    )
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
    }).lazy(parentLazyFn)
    const targetRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/target',
      preload: false,
      beforeLoad: () => {
        throw notFound()
      },
    }).lazy(targetLazyFn)
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([targetRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preloaded = await router.preloadRoute({ to: '/parent/target' })

    expect(targetLazyFn).not.toHaveBeenCalled()
    expect(parentLazyFn).toHaveBeenCalledOnce()
    expect(parentNotFoundPreload).toHaveBeenCalledOnce()
    expect(preloaded?.[1]).toMatchObject({
      routeId: parentRoute.id,
      status: 'notFound',
      error: { isNotFound: true },
    })
  })

  test.each(['errorComponent', 'notFoundComponent'] as const)(
    'retries a failed on-demand %s chunk',
    async (componentType) => {
      const preload = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('boundary download failed'))
        .mockResolvedValue(undefined)
      const boundary = Object.assign(() => null, { preload })
      const rootRoute = new BaseRootRoute({})
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        [componentType]: boundary,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await expect(
        router.loadRouteChunk(targetRoute, componentType),
      ).rejects.toThrow('boundary download failed')
      await expect(
        router.loadRouteChunk(targetRoute, componentType),
      ).resolves.toBeUndefined()

      expect(preload).toHaveBeenCalledTimes(2)
    },
  )

  test('preloads the target of a twenty-hop redirect chain', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 20) {
        throw redirect({
          to: '/hop/$hop',
          params: { hop: String(hop + 1) },
        } as any)
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches?.at(-1)).toMatchObject({
      routeId: hopRoute.id,
      status: 'success',
      params: { hop: '20' },
    })
  })

  test('stops a preload after the twenty-hop redirect limit', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      if (hop < 22) {
        throw redirect({
          to: '/hop/$hop',
          params: { hop: String(hop + 1) },
        } as any)
      }
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches?.find((match) => match.status !== 'success')).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({
        message: 'Too many redirects',
      }),
    })
  })

  test('returns no preload matches for a document redirect at the limit', async () => {
    const beforeLoad = vi.fn(({ params }) => {
      const hop = Number(params.hop)
      throw redirect({
        to: '/hop/$hop',
        params: { hop: String(hop + 1) },
        reloadDocument: hop === 20,
      } as any)
    })
    const rootRoute = new BaseRootRoute({})
    const hopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/hop/$hop',
      beforeLoad,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([hopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({
      to: '/hop/$hop',
      params: { hop: '0' },
    } as any)

    expect(beforeLoad).toHaveBeenCalledTimes(21)
    expect(matches).toBeUndefined()
  })

  test('reports a chunk redirect limit at root', async () => {
    const chunkError = new Error('route chunk failed')
    const rootRoute = new BaseRootRoute({})
    const loopRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/loop',
      onError: () => {
        throw redirect({ to: '/loop' })
      },
    }).lazy(() => Promise.reject(chunkError))
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([loopRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    const matches = await router.preloadRoute({ to: '/loop' })

    const terminal = matches?.find((match) => match.status !== 'success')
    expect(terminal).toMatchObject({
      routeId: rootRoute.id,
      status: 'error',
      error: expect.objectContaining({ message: 'Too many redirects' }),
    })
  })
})
