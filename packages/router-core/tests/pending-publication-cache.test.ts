import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Pending publication replaces the active lane before the final commit. The
 * exiting matches must survive in cachedMatches: when the published load is
 * later superseded (back navigation being the canonical case), the final
 * commit that would have cached them never runs, and fresh within-staleTime
 * data would otherwise be re-fetched with a pending flash.
 */

describe('pending publication preserves exiting matches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('back navigation during a pending-published load reuses the exited fresh match', async () => {
    const slowGate = createControlledPromise<void>()
    const aLoader = vi.fn(() => 'a data')
    const bLoader = vi.fn(async () => {
      await slowGate
      return 'b data'
    })

    const rootRoute = new BaseRootRoute({})
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      staleTime: 60_000,
      loader: aLoader,
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      pendingMs: 1,
      pendingComponent: {},
      loader: bLoader,
    })

    const history = createMemoryHistory({ initialEntries: ['/a'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, bRoute]),
      history,
    })

    await router.load()
    expect(aLoader).toHaveBeenCalledTimes(1)

    const navigation = router.navigate({ to: '/b' })
    await vi.waitFor(() => expect(bLoader).toHaveBeenCalledTimes(1))

    // Let pendingMs elapse so the render-ready pending lane is published.
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() =>
      expect(
        router.state.matches.some(
          (match) => match.routeId === bRoute.id && match.status === 'pending',
        ),
      ).toBe(true),
    )

    // The exited /a match must still exist somewhere.
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === aRoute.id),
    ).toBe(true)

    // Supersede the pending-published /b load by going back to /a.
    const back = router.navigate({ to: '/a' })
    await vi.waitFor(() =>
      expect(
        router.state.matches.find((match) => match.routeId === aRoute.id)
          ?.status,
      ).toBe('success'),
    )

    // Fresh within-staleTime data was served from cache, not re-fetched.
    expect(aLoader).toHaveBeenCalledTimes(1)
    expect(
      router.state.matches.find((match) => match.routeId === aRoute.id)
        ?.loaderData,
    ).toBe('a data')

    slowGate.resolve()
    await Promise.allSettled([navigation, back])
  })
})
