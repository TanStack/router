import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A genuinely fatal rejection inside loadClientMatches (not a route outcome —
 * e.g. resolveRedirect throwing while finalizing a serial beforeLoad
 * redirect) must stay observable instead of being silently swallowed, and
 * the defensive commit that follows must not publish matches whose load
 * promises never settled: the serial redirect capped the loader prefix at 0,
 * so the loader phase never ran for ancestor matches and their pending
 * loadPromise would hang Suspense forever.
 */

describe('fatal load rejection', () => {
  test('fatal rejection during a serial-redirect-capped pass surfaces and settles the lane', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)

    try {
      const boom = new Error('resolveRedirect failed')

      const rootRoute = new BaseRootRoute({
        // Never runs: the serial redirect caps the loader prefix at 0. Its
        // loadPromise (created for the beforeLoad phase) must still settle.
        loader: () => 'root data',
      })
      const badRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/bad',
        beforeLoad: () => {
          // resolveRedirect builds the target location; the throwing search
          // updater turns redirect finalization into a fatal rejection.
          throw redirect({
            to: '/bad',
            search: () => {
              throw boom
            },
          })
        },
      })
      const safeLoader = vi.fn(() => 'safe data')
      const safeRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/safe',
        loader: safeLoader,
      })

      const router = createTestRouter({
        routeTree: rootRoute.addChildren([badRoute, safeRoute]),
        history: createMemoryHistory({ initialEntries: ['/bad'] }),
      })

      await router.load()

      // The failure stayed observable.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandledRejection).toHaveBeenCalledWith(boom, expect.anything())

      // A fatal machinery failure is not a route-level error that can be
      // rendered by the matched route. Once router.load() has returned, the
      // public lane must be settled and the router must remain usable.
      expect(router.state.isLoading).toBe(false)

      // A dangling readiness owner would strand framework consumers on the
      // failed lane. Prove liveness through a normal follow-up navigation
      // instead of inspecting match-owned promise bookkeeping.
      await router.navigate({ to: '/safe' })
      expect(router.state.location.pathname).toBe('/safe')
      expect(router.state.isLoading).toBe(false)
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: safeRoute.id,
        status: 'success',
        loaderData: 'safe data',
      })
      expect(safeLoader).toHaveBeenCalledTimes(1)
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })
})
