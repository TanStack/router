import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue 10: a preload started after foreground pending publication should not
 * be dropped just because it borrows an active match that is still pending.
 * After commitReady moves pending matches into active stores, preload joining
 * must still wait for the foreground load instead of abandoning descendants.
 *
 * This test performs a real foreground navigation to /parent, publishes the
 * pending parent match, then preloads /parent/child while final commit is held
 * open by async head projection. The descendant preload loader should still run
 * and cache the child match.
 */

describe('issue 10: preload during foreground pending publication', () => {
  test('preload started after pending publication still loads and caches descendant routes', async () => {
    const parentLoaderGate = createControlledPromise<{ parent: string }>()
    const parentHeadGate = createControlledPromise<{
      meta: Array<{ title: string }>
    }>()
    const parentLoader = vi.fn(() => parentLoaderGate)
    const parentHead = vi.fn(() => parentHeadGate)
    const childLoader = vi.fn(() => ({ child: 'preloaded' }))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: parentLoader,
      head: parentHead,
      pendingMs: 0,
      pendingComponent: {},
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

    const navigation = router.navigate({ to: '/parent' })
    await vi.waitFor(() => expect(parentLoader).toHaveBeenCalledTimes(1))

    await vi.waitFor(() => {
      const activeParent = router.state.matches.find(
        (match) => match.routeId === parentRoute.id,
      )
      expect(activeParent?.status).toBe('pending')
      expect(router.stores.pendingIds.get()).toEqual([])
    })

    const preload = router.preloadRoute({ to: '/parent/child' })
    await Promise.resolve()
    expect(childLoader).not.toHaveBeenCalled()

    parentLoaderGate.resolve({ parent: 'loaded' })
    await vi.waitFor(() => expect(parentHead).toHaveBeenCalledTimes(1))

    expect(
      router.state.matches.find((match) => match.routeId === parentRoute.id)
        ?.status,
    ).toBe('pending')

    parentHeadGate.resolve({ meta: [{ title: 'Parent' }] })
    const [, preloadMatches] = await Promise.all([navigation, preload])

    expect(childLoader).toHaveBeenCalledTimes(1)
    expect(
      preloadMatches?.some((match) => match.routeId === childRoute.id),
    ).toBe(true)
    expect(
      router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === childRoute.id)?.loaderData,
    ).toEqual({ child: 'preloaded' })
  })
})
