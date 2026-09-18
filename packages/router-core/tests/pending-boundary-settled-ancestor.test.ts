import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * The pending boundary must advance past matches that have already settled.
 * A layout route with no loader is offered as the boundary while its lazy
 * chunk loads, but once it settles the boundary belongs on the leaf that is
 * still loading so the layout shell renders instead of staying behind the
 * fallback.
 */

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pending boundary must advance past settled ancestors', () => {
  test('a layout route with no loader does not stay the pending boundary once it settles', async () => {
    const leafLoader = createControlledPromise<string>()

    const rootRoute = new BaseRootRoute({ component: () => null })
    const authRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_auth',
      loader: () => ({}),
      component: () => null,
    })
    const sidebarRoute = new BaseRoute({
      getParentRoute: () => authRoute,
      id: '_sidebar',
      component: () => null,
    })
    // A layout route with no loader that still has a lazy chunk to fetch.
    const headerRoute = new BaseRoute({
      getParentRoute: () => authRoute,
      id: '_header',
      pendingComponent: () => null,
    })
    const headerChunk = createControlledPromise<any>()
    headerRoute.lazy(() => headerChunk)

    const listRoute = new BaseRoute({
      getParentRoute: () => sidebarRoute,
      path: '/users',
      component: () => null,
    })
    const detailRoute = new BaseRoute({
      getParentRoute: () => headerRoute,
      path: '/users/$userId',
      loader: () => leafLoader,
      pendingComponent: () => null,
      component: () => null,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        authRoute.addChildren([
          sidebarRoute.addChildren([listRoute]),
          headerRoute.addChildren([detailRoute]),
        ]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/users'] }),
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })

    await router.load()

    const navigation = router.navigate({
      to: '/users/$userId',
      params: { userId: 'u1' },
    })

    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === headerRoute.id)
          ?.status,
      ).toBe('pending'),
    )

    headerChunk.resolve({
      options: { id: headerRoute.id, component: () => null },
    })

    await vi.waitFor(() =>
      expect(
        router.state.matches.map((match) => [match.routeId, match.status]),
      ).toEqual([
        [rootRoute.id, 'success'],
        [authRoute.id, 'success'],
        [headerRoute.id, 'success'],
        [detailRoute.id, 'pending'],
      ]),
    )

    leafLoader.resolve('leaf data')
    await navigation
  })

  test('an initial load presents the layout as settled once its loader resolves', async () => {
    const layoutLoader = createControlledPromise<string>()
    const childLoader = createControlledPromise<string>()

    const rootRoute = new BaseRootRoute({ component: () => null })
    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      loader: () => layoutLoader,
      pendingComponent: () => null,
      component: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/child',
      loader: () => childLoader,
      pendingComponent: () => null,
      component: () => null,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/child'] }),
      defaultPendingMs: 0,
      defaultPendingMinMs: 0,
    })

    const load = router.load()

    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === layoutRoute.id)
          ?.status,
      ).toBe('pending'),
    )

    layoutLoader.resolve('layout data')

    await vi.waitFor(() =>
      expect(
        router.state.matches.map((match) => [match.routeId, match.status]),
      ).toEqual([
        [rootRoute.id, 'success'],
        [layoutRoute.id, 'success'],
        [childRoute.id, 'pending'],
      ]),
    )

    childLoader.resolve('child data')
    await load
  })

  test('pendingMinMs on a settled boundary does not pin the presented snapshot', async () => {
    const leafLoader = createControlledPromise<string>()

    const rootRoute = new BaseRootRoute({ component: () => null })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => null,
    })
    const layoutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      pendingComponent: () => null,
    })
    const layoutChunk = createControlledPromise<any>()
    layoutRoute.lazy(() => layoutChunk)

    const leafRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/leaf',
      loader: () => leafLoader,
      pendingComponent: () => null,
      component: () => null,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([leafRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingMs: 0,
      defaultPendingMinMs: 400,
    })

    await router.load()
    const navigation = router.navigate({ to: '/leaf' })

    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === layoutRoute.id)
          ?.status,
      ).toBe('pending'),
    )

    layoutChunk.resolve({
      options: { id: layoutRoute.id, component: () => null },
    })

    await vi.waitFor(() =>
      expect(
        router.state.matches.map((match) => [match.routeId, match.status]),
      ).toEqual([
        [rootRoute.id, 'success'],
        [layoutRoute.id, 'success'],
        [leafRoute.id, 'pending'],
      ]),
    )

    leafLoader.resolve('leaf data')
    await navigation
  })
})
