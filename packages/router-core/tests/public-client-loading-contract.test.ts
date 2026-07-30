import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

describe('public client loading contracts', () => {
  test('blocking loading is observable through match isFetching', async () => {
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
      pendingMs: 0,
      pendingComponent: () => null,
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/target' })

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === targetRoute.id),
      ).toMatchObject({ status: 'pending', isFetching: 'loader' }),
    )

    loaderGate.resolve('target data')
    await navigation

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      isFetching: false,
      loaderData: 'target data',
    })
  })

  test('a background descendant redirect wins after a blocking ancestor loader fails', async () => {
    const childStarted = createControlledPromise<void>()
    const childRedirect = createControlledPromise<void>()
    const parentError = new Error('parent failed')
    let parentLoads = 0
    let childLoads = 0

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: {
        staleReloadMode: 'blocking',
        handler: async () => {
          if (++parentLoads === 1) {
            return 'parent data'
          }
          await childStarted
          throw parentError
        },
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async () => {
        if (++childLoads === 1) {
          return 'child data'
        }
        childStarted.resolve()
        await childRedirect
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        parentRoute.addChildren([childRoute]),
        targetRoute,
      ]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()
    const invalidation = router.invalidate()
    await childStarted
    childRedirect.resolve()
    await invalidation

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
    expect(
      router.state.matches.some((match) => match.error === parentError),
    ).toBe(false)
  })
})
