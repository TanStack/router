import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Port of the essential test from PR #6645: a rejected route lazy chunk
 * (e.g. network error or stale chunk after a deploy) must not leak an
 * unhandled promise rejection from loadRouteChunk's internal promise
 * bookkeeping (Sentry noise), and must be evicted so a later pass can retry
 * the import.
 *
 * Adapted to this branch's semantics: loadRouteChunk propagates the
 * rejection to its awaiting caller (who normalizes it through the route
 * failure lifecycle) instead of swallowing it.
 */
describe('loadRouteChunk lazy chunk rejection (PR #6645 port)', () => {
  test('rejected lazyFn is observed internally, evicted, and retryable', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    try {
      const chunkError = new TypeError(
        'Failed to fetch dynamically imported module: /assets/foo.lazy-abc123.js',
      )
      let lazyCalls = 0
      const fooComponent = () => null
      const rootRoute = new BaseRootRoute({})
      const fooRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/foo',
      }).lazy(() => {
        lazyCalls++
        if (lazyCalls === 1) {
          return Promise.reject(chunkError)
        }
        return Promise.resolve({ options: { component: fooComponent } } as any)
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([fooRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      // The rejection reaches the awaiting caller (route failure lifecycle
      // territory during real navigations)…
      await expect(router.loadRouteChunk(fooRoute as any)).rejects.toBe(
        chunkError,
      )

      // …while the internal cached promise chain observes it, so nothing
      // escapes to the global unhandledrejection channel.
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandledRejection).not.toHaveBeenCalled()

      // The failed chunk is evicted, not poisoned forever.
      expect((fooRoute as any)._lazyPromise).toBeUndefined()
      expect((fooRoute as any)._lazyLoaded).toBeFalsy()
      expect((fooRoute as any)._componentsLoaded).toBeFalsy()

      // A later pass retries the import and succeeds.
      await router.loadRouteChunk(fooRoute as any)
      expect(lazyCalls).toBe(2)
      expect((fooRoute as any)._lazyLoaded).toBe(true)
      expect((fooRoute as any)._componentsLoaded).toBe(true)
      expect(fooRoute.options.component).toBe(fooComponent)
      expect(unhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })
})
