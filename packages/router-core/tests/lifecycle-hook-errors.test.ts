import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Route lifecycle hooks (onEnter/onStay/onLeave) run after the final commit.
 * A throwing hook is a user error: it must stay observable (unhandled
 * rejection for the app's error reporting), but it must not be silently
 * swallowed, skip the remaining hooks, or leave the navigation un-committed.
 */

describe('lifecycle hook errors', () => {
  test('a throwing onEnter surfaces as an unhandled rejection and does not skip other hooks', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)

    try {
      const hookError = new Error('onEnter failed')
      const parentOnEnter = vi.fn(() => {
        throw hookError
      })
      const childOnEnter = vi.fn()
      const indexOnLeave = vi.fn()

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        onLeave: indexOnLeave,
      })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        onEnter: parentOnEnter,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        onEnter: childOnEnter,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      await router.navigate({ to: '/parent/child' })

      // Navigation committed despite the throwing hook. (status 'idle' is
      // owned by framework transitioners, so a core test asserts isLoading.)
      expect(router.state.location.pathname).toBe('/parent/child')
      expect(router.stores.isLoading.get()).toBe(false)
      expect(
        router.state.matches.find((m) => m.routeId === childRoute.id)?.status,
      ).toBe('success')

      // All hooks ran; the failure did not short-circuit the loop.
      expect(parentOnEnter).toHaveBeenCalledTimes(1)
      expect(childOnEnter).toHaveBeenCalledTimes(1)

      // The error stayed observable.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandledRejection).toHaveBeenCalledWith(
        hookError,
        expect.anything(),
      )
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })
  test('a throwing onLeave does not skip the entered route hooks at the same index', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)

    try {
      const leaveError = new Error('onLeave failed')
      const aOnLeave = vi.fn(() => {
        throw leaveError
      })
      const bOnEnter = vi.fn()

      const rootRoute = new BaseRootRoute({})
      const aRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/a',
        onLeave: aOnLeave,
      })
      const bRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/b',
        onEnter: bOnEnter,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([aRoute, bRoute]),
        history: createMemoryHistory({ initialEntries: ['/a'] }),
      })

      await router.load()
      await router.navigate({ to: '/b' })

      expect(aOnLeave).toHaveBeenCalledTimes(1)
      expect(bOnEnter).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandledRejection).toHaveBeenCalledWith(
        leaveError,
        expect.anything(),
      )
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })
})
