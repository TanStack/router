import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

describe('public preload lane contracts', () => {
  test.each([
    {
      difference: 'pathname',
      preloadMask: { to: '/mask-a' },
      navigationMask: { to: '/mask-b' },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-b',
    },
    {
      difference: 'unmaskOnReload',
      preloadMask: { to: '/mask-a' },
      navigationMask: { to: '/mask-a', unmaskOnReload: true },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
    {
      difference: 'search',
      preloadMask: { to: '/mask-a', search: { source: 'preload' } },
      navigationMask: { to: '/mask-a', search: { source: 'navigation' } },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
    {
      difference: 'state',
      preloadMask: { to: '/mask-a', state: { source: 'preload' } },
      navigationMask: { to: '/mask-a', state: { source: 'navigation' } },
      preloadPathname: '/mask-a',
      navigationPathname: '/mask-a',
    },
  ])(
    'navigation reruns beforeLoad for a different explicit mask $difference on the same destination',
    async ({
      preloadMask,
      navigationMask,
      preloadPathname,
      navigationPathname,
    }) => {
      const beforeLoadGate = createControlledPromise<void>()
      const loaderGate = createControlledPromise<string>()
      const beforeLoad = vi.fn(
        async (context: {
          location: { maskedLocation?: { pathname: string } }
          preload: boolean
        }) => {
          if (context.preload) {
            await beforeLoadGate
          }
          return { source: context.preload ? 'preload' : 'navigation' }
        },
      )
      const loader = vi.fn(() => loaderGate)
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
      const maskARoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/mask-a',
      })
      const maskBRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/mask-b',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          targetRoute,
          maskARoute,
          maskBRoute,
        ]),
        ...('search' in preloadMask ? { stringifySearch: () => '' } : {}),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      let preload: Promise<unknown> | undefined
      let navigation: Promise<unknown> | undefined
      try {
        await router.load()
        preload = router.preloadRoute({
          to: '/target',
          mask: preloadMask as any,
        })
        await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

        beforeLoadGate.resolve()
        await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

        navigation = router.navigate({
          to: '/target',
          mask: navigationMask as any,
        })
        await vi.waitFor(() =>
          expect(
            beforeLoad.mock.calls.map(([callContext]) => ({
              preload: callContext.preload,
              pathname: callContext.location.maskedLocation?.pathname,
            })),
          ).toEqual([
            { preload: true, pathname: preloadPathname },
            { preload: false, pathname: navigationPathname },
          ]),
        )

        loaderGate.resolve('shared loader data')
        await Promise.all([preload, navigation])

        expect(router.state.matches.at(-1)?.context).toEqual({
          source: 'navigation',
        })
        expect(router.history.location.pathname).toBe(navigationPathname)
        expect(loader).toHaveBeenCalledTimes(1)
      } finally {
        beforeLoadGate.resolve()
        loaderGate.resolve('shared loader data')
        const activeWork: Array<Promise<unknown>> = []
        if (preload) {
          activeWork.push(preload)
        }
        if (navigation) {
          activeWork.push(navigation)
        }
        await Promise.allSettled(activeWork)
      }
    },
  )

  test('navigation does not adopt beforeLoad from an active preload with different params', async () => {
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
    const preload = router.preloadRoute({
      to: '/items/$itemId/first',
      params: { itemId: 'one' },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({
      to: '/items/$itemId/first',
      params: { itemId: 'two' },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(router.state.location.pathname).toBe('/items/two/first')
    expect(router.state.location.search).toEqual({})
    expect(router.state.matches.at(-1)?.context).toEqual({ preload: false })
  })

  test('a different full navigation lane reruns beforeLoad but reuses active same-id loader work', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
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
  })

  test('different same-href preload lanes rerun beforeLoad but share loader work by match id', async () => {
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
      validateSearch: (search: Record<string, unknown>) => ({
        version: Number(search.version),
      }),
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
      stringifySearch: () => '',
    })

    await router.load()
    const first = router.preloadRoute({
      to: '/parent/first',
      search: { version: 1 },
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.preloadRoute({
      to: '/parent/first',
      search: { version: 2 },
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(loader).toHaveBeenCalledTimes(1)
    loaderGate.resolve('parent data')
    await Promise.all([first, second])

    expect(beforeLoad).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('completed preloads cache loader data but not beforeLoad context', async () => {
    const beforeLoad = vi.fn(({ preload }: { preload: boolean }) => ({
      source: preload ? 'preload' : 'navigation',
    }))
    const loader = vi.fn(
      ({ context }: { context: { source: string } }) => context.source,
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
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    await router.navigate({ to: '/target' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      context: { source: 'navigation' },
      loaderData: 'preload',
    })
  })

  test('navigation retries an adopted preload lane that failed', async () => {
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

  test('filtered invalidation reloads every generation of the selected match id', async () => {
    const loader = vi.fn(() => `loader data ${loader.mock.calls.length}`)
    const rootRoute = new BaseRootRoute({})
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      validateSearch: (search: Record<string, unknown>) => ({
        revision: Number(search.revision ?? 1),
      }),
      shouldReload: ({ location }) =>
        (location.search as { revision: number }).revision === 2
          ? true
          : undefined,
      loader,
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
    await router.invalidate({
      filter: (match) => (match.search as { revision?: number }).revision === 1,
    })

    expect(loader).toHaveBeenCalledTimes(3)
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data 3')
  })

  test('preload false skips speculation but performs a blocking navigation load', async () => {
    const loaderGate = createControlledPromise<string>()
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      preload: false,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/target' })
    expect(loader).not.toHaveBeenCalled()

    let settled = false
    const navigation = router.navigate({ to: '/target' }).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    expect(settled).toBe(false)

    loaderGate.resolve('target data')
    await navigation

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'target data',
    })
  })

  test('forwards a document redirect at the redirect limit', async () => {
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
})
