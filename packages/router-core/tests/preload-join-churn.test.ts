import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A preload that borrows an active match waits for the foreground load to
 * commit — but that wait must be bounded. Under sustained navigation churn
 * (every foreground load replaced by a newer one before the borrowed owner
 * commits), the preload must settle by dropping the speculative pass
 * instead of hanging its awaiter indefinitely.
 */

describe('preload join under navigation churn', () => {
  test('a borrowing preload settles instead of outwaiting endless foreground loads', async () => {
    vi.useFakeTimers()
    try {
      const gates: Array<ReturnType<typeof createControlledPromise<void>>> = []
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        pendingMs: 0,
        pendingComponent: {},
        loader: async ({
          abortController,
        }: {
          abortController: AbortController
        }) => {
          const gate = createControlledPromise<void>()
          gates.push(gate)
          // Signal-aware like a real fetch: an aborted (superseded) load
          // settles instead of hanging on abandoned work.
          abortController.signal.addEventListener('abort', () => gate.resolve())
          await gate
          return 'parent'
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: () => 'child',
      })
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()

      // Foreground navigation to /parent; pendingMs 0 publishes the pending
      // lane so the parent match becomes a borrowable pending-published
      // owner in the active store.
      const navigations: Array<Promise<unknown>> = [
        router.navigate({ to: '/parent' }),
      ]
      await vi.waitFor(() => expect(gates.length).toBe(1))

      let preloadSettled = false
      const preload = router
        .preloadRoute({ to: '/parent/child' } as any)
        .then(() => {
          preloadSettled = true
        })

      // Churn: keep superseding the foreground load before the parent ever
      // commits. Each cycle replaces router.latestLoadPromise.
      for (let i = 0; i < 6; i++) {
        navigations.push(router.navigate({ to: '/parent', replace: true }))
        await vi.advanceTimersByTimeAsync(1)
      }

      // The preload must have given up by now (bounded wait), even though
      // the foreground owner still has not committed.
      await vi.waitFor(() => expect(preloadSettled).toBe(true))

      for (const gate of gates) {
        gate.resolve()
      }
      await Promise.allSettled([...navigations, preload])
    } finally {
      vi.useRealTimers()
    }
  })
})
