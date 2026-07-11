import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Cache ownership cannot be inferred from updatedAt alone. Two distinct
 * synchronous loader generations can legitimately finish in the same
 * millisecond, especially under cached data clients or local loaders.
 */
test('a same-millisecond preload refresh replaces the borrowed navigation cache entry', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)

  try {
    let revision = 1
    const reportsLoader = vi.fn(() => ({ revision }))

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const reportsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/reports',
      // Navigations keep cached data, while hover preloads explicitly refresh
      // it. Both synchronous generations below finish at the same Date.now().
      staleTime: Infinity,
      preloadStaleTime: 0,
      gcTime: 60_000,
      loader: reportsLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, reportsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/reports' })
    await router.navigate({ to: '/' })

    expect(reportsLoader).toHaveBeenCalledTimes(1)
    expect(
      router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === reportsRoute.id)?.loaderData,
    ).toEqual({ revision: 1 })

    // The preload re-runs synchronously because preloadStaleTime is zero. The
    // clock intentionally does not advance, so old and fresh snapshots have
    // equal updatedAt values despite coming from different loader generations.
    revision = 2
    const preloadedMatches = await router.preloadRoute({ to: '/reports' })
    const preloadedReport = preloadedMatches?.find(
      (match) => match.routeId === reportsRoute.id,
    )

    expect(reportsLoader).toHaveBeenCalledTimes(2)
    expect(preloadedReport?.loaderData).toEqual({ revision: 2 })

    // The refreshed snapshot is owned work and must replace the old cache
    // entry even though Date.now() could not distinguish the generations.
    expect(
      router.stores.cachedMatches
        .get()
        .find((match) => match.routeId === reportsRoute.id)?.loaderData,
    ).toEqual({ revision: 2 })

    await router.navigate({ to: '/reports' })

    // staleTime=Infinity makes the user-visible navigation consume the cache.
    // It must see the fresh preload result without executing a third loader.
    expect(reportsLoader).toHaveBeenCalledTimes(2)
    expect(
      router.state.matches.find((match) => match.routeId === reportsRoute.id)
        ?.loaderData,
    ).toEqual({ revision: 2 })
  } finally {
    vi.useRealTimers()
  }
})
