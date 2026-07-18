import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('client loading contracts', () => {
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

    const cached = router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === targetRoute.id)
    expect(cached?.loaderData).toBe('preload')
    expect(cached?.__beforeLoadContext).toBeUndefined()
    expect(cached?.context).not.toMatchObject({ source: 'preload' })

    await router.navigate({ to: '/target' })

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.context).toEqual({
      source: 'navigation',
    })
    expect(router.state.matches.at(-1)?.loaderData).toBe('preload')
  })

  test('navigation can adopt an identical preload while beforeLoad is running', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      await beforeLoadGate
      return { source: preload ? 'preload' : 'navigation' }
    })
    const loader = vi.fn(() => 'loader data')
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
    await Promise.resolve()
    expect(beforeLoad).toHaveBeenCalledTimes(1)

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)?.context).toEqual({ source: 'preload' })
    expect(router.state.matches.at(-1)?.loaderData).toBe('loader data')
  })

  test('navigation does not adopt beforeLoad from a different preload lane', async () => {
    const beforeLoadGate = createControlledPromise<void>()
    const beforeLoad = vi.fn(async ({ preload }: { preload: boolean }) => {
      await beforeLoadGate
      return { preload }
    })
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      beforeLoad,
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
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/parent/first' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({ to: '/parent/second' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    beforeLoadGate.resolve()
    await Promise.all([preload, navigation])

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(router.state.matches.at(-1)?.routeId).toBe(secondRoute.id)
  })

  test('a beforeLoad-only completed preload does not create a cache entry', async () => {
    const beforeLoad = vi.fn(() => ({ guarded: true }))
    const rootRoute = new BaseRootRoute({})
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
    await router.preloadRoute({ to: '/target' })

    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === targetRoute.id),
    ).toBe(false)
  })

  test('preload false performs a blocking navigation load', async () => {
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
})
