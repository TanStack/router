import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #6107: going offline and hovering a link (preload intent) made the
 * failed dynamic import surface as an unhandled rejection in the console, and
 * the error never reached the route's error component.
 *
 * Desired behavior:
 * - a hover preload whose lazy chunk rejects resolves non-fatally and leaves
 *   no unhandled rejection (only a deliberate dev-only console.error), and
 * - the failed chunk is evicted, so the subsequent real navigation retries
 *   the import and commits the chunk error onto the match (status 'error'),
 *   which is what framework error components render.
 */
describe('issue #6107: failed dynamic import of a lazy route chunk', () => {
  test('hover preload failure is non-fatal and navigation surfaces the chunk error to the error boundary', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    try {
      const chunkError = new TypeError(
        'Failed to fetch dynamically imported module: /assets/posts.lazy-abc123.js',
      )
      let lazyCalls = 0
      const rootRoute = new BaseRootRoute({})
      const postsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
      }).lazy(() => {
        lazyCalls++
        return Promise.reject(chunkError)
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      await router.load()

      // Hovering a <Link> while offline: the preload must resolve without
      // throwing and without leaking an unhandled rejection.
      await router.preloadRoute({ to: '/posts' })
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandledRejection).not.toHaveBeenCalled()
      // The preload attempted the import at least once (the error path may
      // legitimately retry once more for the errorComponent chunk).
      expect(lazyCalls).toBeGreaterThanOrEqual(1)
      const lazyCallsAfterPreload = lazyCalls

      // Clicking the link: the rejected chunk was evicted (not cached), so
      // navigation retries the import; when it fails again the error is
      // committed on the match for the error component to render.
      await router.navigate({ to: '/posts' })
      const postsMatch = router.state.matches.find(
        (match) => match.routeId === postsRoute.id,
      )
      // The rejected chunk was not replayed from cache: navigation retried
      // the import.
      expect(lazyCalls).toBeGreaterThan(lazyCallsAfterPreload)
      expect(postsMatch?.status).toBe('error')
      expect(postsMatch?.error).toBe(chunkError)
      expect(unhandledRejection).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
      process.off('unhandledRejection', unhandledRejection)
    }
  })
})
