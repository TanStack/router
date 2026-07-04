import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Repro for https://github.com/TanStack/router/issues/4112
 *
 * Preloading a route nested under a pathless layout must retain the cached
 * layout match between hovers. With a short `defaultStaleTime`, repeated
 * hover preloads after staleTime (but within preloadStaleTime) must not
 * re-run the layout loader: preload freshness is governed by
 * preloadStaleTime, and the cached owned preload matches (layout included)
 * must survive between preload passes.
 */
test('repeated hover preloads reuse the cached layout match within preloadStaleTime', async () => {
  const layoutLoader = vi.fn(() => 'layout data')
  const aboutLoader = vi.fn(() => 'about data')

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const layoutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '/_layout',
    loader: layoutLoader,
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => layoutRoute,
    path: '/about',
    loader: aboutLoader,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      layoutRoute.addChildren([aboutRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    // Mirrors the issue's setup: staleTime much shorter than the (default
    // 30s) preloadStaleTime.
    defaultStaleTime: 10,
  })

  await router.load()

  // First hover
  await router.preloadRoute({ to: '/about' } as any)

  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(aboutLoader).toHaveBeenCalledTimes(1)

  const cachedAfterFirst = router.stores.cachedMatches.get()
  expect(
    cachedAfterFirst.some((match) => match.routeId === layoutRoute.id),
  ).toBe(true)
  expect(
    cachedAfterFirst.some((match) => match.routeId === aboutRoute.id),
  ).toBe(true)

  // Wait past staleTime but well within preloadStaleTime.
  await sleep(50)

  // Repeated hovers
  await router.preloadRoute({ to: '/about' } as any)
  await router.preloadRoute({ to: '/about' } as any)

  // The layout loader must be cached exactly like the leaf loader.
  expect(layoutLoader).toHaveBeenCalledTimes(1)
  expect(aboutLoader).toHaveBeenCalledTimes(1)

  // The cached layout match is retained across preload passes.
  const cachedAfterRepeat = router.stores.cachedMatches.get()
  expect(
    cachedAfterRepeat.some((match) => match.routeId === layoutRoute.id),
  ).toBe(true)
})
