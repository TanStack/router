import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A preload pass that borrows a navigation-cached entry without re-running
 * its loader (fresh within preloadStaleTime) does not own that snapshot and
 * must not re-cache it: doing so would restamp `preload: true` and silently
 * demote the entry from `gcTime` to `preloadGcTime` while keeping its old
 * `updatedAt`, evicting it at the next commit-time GC.
 *
 * Only snapshots the pass actually produced — new matches, or borrowed
 * entries whose loader re-ran under the pass — enter the cache.
 */

function setup(routeOptions: {
  gcTime: number
  preloadGcTime: number
  preloadStaleTime: number
}) {
  let calls = 0
  const postsLoader = vi.fn(() => ({ value: ++calls }))

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    loader: postsLoader,
    ...routeOptions,
  })
  const otherRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute, otherRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const getCachedEntry = () =>
    router.stores.cachedMatches
      .get()
      .find((match) => match.routeId === postsRoute.id)

  return { router, postsLoader, getCachedEntry }
}

test('preloading a fresh navigation-cached entry does not demote it to preloadGcTime', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  try {
    const { router, postsLoader, getCachedEntry } = setup({
      gcTime: 30 * 60_000,
      preloadGcTime: 30_000,
      preloadStaleTime: 10 * 60_000,
    })

    await router.load()
    await router.navigate({ to: '/posts' })
    expect(postsLoader).toHaveBeenCalledTimes(1)
    await router.navigate({ to: '/' })

    const navigationEntry = getCachedEntry()!
    expect(navigationEntry.status).toBe('success')
    expect(navigationEntry.preload).toBeFalsy()

    // Past preloadGcTime (30s), well within gcTime (30min).
    vi.setSystemTime(61_000)

    // Fresh within preloadStaleTime: the preload borrows the cached entry
    // and its loader does not re-run.
    await router.preloadRoute({ to: '/posts' } as any)
    expect(postsLoader).toHaveBeenCalledTimes(1)

    // The navigation-owned cache entry is untouched.
    const afterPreload = getCachedEntry()!
    expect(afterPreload.preload).toBeFalsy()
    expect(afterPreload.updatedAt).toBe(navigationEntry.updatedAt)

    // Commit-time GC keeps the entry alive under gcTime.
    await router.navigate({ to: '/other' })
    expect(getCachedEntry()).toBeDefined()

    // And the entry still expires under its own gcTime.
    vi.setSystemTime(1_000 + 31 * 60_000)
    await router.navigate({ to: '/' })
    expect(getCachedEntry()).toBeUndefined()
  } finally {
    vi.useRealTimers()
  }
})

test('a preload that reloads a stale cached entry re-caches the fresh snapshot', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)

  try {
    const { router, postsLoader, getCachedEntry } = setup({
      gcTime: 30 * 60_000,
      preloadGcTime: 30_000,
      preloadStaleTime: 5_000,
    })

    await router.load()
    await router.navigate({ to: '/posts' })
    expect(postsLoader).toHaveBeenCalledTimes(1)
    await router.navigate({ to: '/' })

    // Past preloadStaleTime: the preload re-runs the loader, so the pass
    // owns the fresh snapshot and caches it under preload gc semantics.
    vi.setSystemTime(61_000)
    await router.preloadRoute({ to: '/posts' } as any)
    expect(postsLoader).toHaveBeenCalledTimes(2)

    const refreshed = getCachedEntry()!
    expect(refreshed.preload).toBe(true)
    expect(refreshed.loaderData).toEqual({ value: 2 })
    expect(refreshed.updatedAt).toBe(61_000)
  } finally {
    vi.useRealTimers()
  }
})
