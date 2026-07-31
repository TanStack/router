import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('navigation adopting an in-flight preload', () => {
  test('reruns beforeLoad when router context changes during an active preload', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(
      ({
        context,
        preload,
      }: {
        context: { auth: boolean }
        preload: boolean
      }) => ({ authorization: `${context.auth}:${preload}` }),
    )
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute<any, undefined, { auth: boolean }>({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { auth: false },
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    router.update({ ...router.options, context: { auth: true } })
    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(beforeLoad.mock.calls.map(([context]) => context.preload)).toEqual([
      true,
      false,
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(router.state.matches.at(-1)?.context).toEqual({
      auth: true,
      authorization: 'true:false',
    })
  })

  test('reruns beforeLoad when user location state changes at the same href', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn(
      ({ location, preload }: { location: any; preload: boolean }) => ({
        authorization: `${location.state.auth}:${preload}`,
      }),
    )
    const loader = vi.fn(() => loaderGate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const guardedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/guarded',
      beforeLoad,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, guardedRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({
      to: '/guarded',
      state: { auth: 'old' } as any,
    })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const navigation = router.navigate({
      to: '/guarded',
      state: { auth: 'new' } as any,
    })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    expect(beforeLoad.mock.results.map((result) => result.value)).toEqual([
      { authorization: 'old:true' },
      { authorization: 'new:false' },
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(router.state.matches.at(-1)?.context).toMatchObject({
      authorization: 'new:false',
    })
  })

  test('reruns beforeLoad when the route tree changes during an active preload', async () => {
    const loaderGate = createControlledPromise<string>()
    const beforeLoad = vi.fn()
    const loader = vi.fn(() => loaderGate)
    const createRouteTree = () => {
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const guardedRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/guarded',
        beforeLoad,
        loader,
      })
      return rootRoute.addChildren([indexRoute, guardedRoute])
    }
    const router = createTestRouter({
      routeTree: createRouteTree(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/guarded' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce())

    router.update({ ...router.options, routeTree: createRouteTree() })
    const navigation = router.navigate({ to: '/guarded' })
    await vi.waitFor(() => expect(beforeLoad).toHaveBeenCalledTimes(2))

    loaderGate.resolve('shared')
    await Promise.all([preload, navigation])
    expect(loader).toHaveBeenCalledOnce()
  })
})
