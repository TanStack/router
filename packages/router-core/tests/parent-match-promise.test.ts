import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test.each([false, true])(
  'preload parentMatchPromise exposes successful preload state with isServer=%s',
  async (isServer) => {
    const seen: Array<unknown> = []
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => 'parent data',
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async ({ parentMatchPromise }) => {
        seen.push(await parentMatchPromise)
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
    })

    await router.preloadRoute({ to: '/parent/child' })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      routeId: parentRoute.id,
      loaderData: 'parent data',
      status: 'success',
      invalid: false,
      preload: true,
      isFetching: false,
    })
  },
)

test.each([false, true])(
  'preload false parentMatchPromise exposes a successful invalid parent with isServer=%s',
  async (isServer) => {
    const seen: Array<unknown> = []
    const parentLoader = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      preload: false,
      loader: parentLoader,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: async ({ parentMatchPromise }) => {
        seen.push(await parentMatchPromise)
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
    })

    await router.preloadRoute({ to: '/parent/child' })

    expect(parentLoader).not.toHaveBeenCalled()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      routeId: parentRoute.id,
      status: 'success',
      invalid: true,
      preload: false,
      isFetching: false,
    })
  },
)
