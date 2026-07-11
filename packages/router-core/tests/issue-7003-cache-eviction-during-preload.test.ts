import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Adapted from the regression tests donated by
 * https://github.com/TanStack/router/pull/7003 (and its alternative
 * https://github.com/TanStack/router/pull/7006).
 *
 * On the old architecture, an in-flight preload lived inside
 * `cachedMatches`, so cache eviction (`clearExpiredCache`) or
 * `router.invalidate()` while the preload was still loading could rip the
 * match out from under `loadRouteMatch`, producing `_nonReactive` crashes
 * and console errors.
 *
 * On this branch, pending preload work is private to the preload lane and
 * must never appear in `cachedMatches` until it has succeeded. Cache
 * clearing and invalidation while a preload is in flight must not crash,
 * must not log errors, and the preload must still complete and cache its
 * successful result.
 */

function setup() {
  let resolveFooLoader: ((value: string) => void) | undefined
  const fooLoader = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        resolveFooLoader = resolve
      }),
  )
  const barLoader = vi.fn(() => 'bar data')

  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    loader: fooLoader,
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    loader: barLoader,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([fooRoute, barRoute]),
    history: createMemoryHistory({ initialEntries: ['/bar'] }),
  })

  return {
    router,
    fooRoute,
    barRoute,
    fooLoader,
    barLoader,
    getResolveFooLoader: () => resolveFooLoader,
  }
}

test('clearCache during an in-flight preload does not crash and the preload still completes', async () => {
  const consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => {})

  try {
    const { router, fooRoute, getResolveFooLoader } = setup()

    await router.load()

    const preloadPromise = router.preloadRoute({ to: '/foo' } as any)
    await Promise.resolve()

    // New invariant: pending preload work is private and must not be
    // observable in the public cache while the loader is in flight.
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === fooRoute.id),
    ).toBe(false)

    // Explicit cache cleanup while the preload is still loading.
    router.clearCache()

    getResolveFooLoader()?.('foo data')

    const preloaded = await preloadPromise

    // The preload completed and cached its owned successful match.
    expect(preloaded?.some((match) => match.routeId === fooRoute.id)).toBe(true)
    expect(
      router.stores.cachedMatches
        .get()
        .some(
          (match) =>
            match.routeId === fooRoute.id && match.status === 'success',
        ),
    ).toBe(true)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  } finally {
    consoleErrorSpy.mockRestore()
  }
})

test('invalidate during an in-flight preload does not crash and both loads settle', async () => {
  const consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => {})

  try {
    const { router, fooRoute, barLoader, getResolveFooLoader } = setup()

    await router.load()
    expect(barLoader).toHaveBeenCalledTimes(1)

    const preloadPromise = router.preloadRoute({ to: '/foo' } as any)
    await Promise.resolve()

    const invalidatePromise = router.invalidate()
    await Promise.resolve()

    getResolveFooLoader()?.('foo data')

    const [preloaded] = await Promise.all([preloadPromise, invalidatePromise])

    // The active route reloaded due to invalidation.
    expect(barLoader).toHaveBeenCalledTimes(2)

    // The preload still settled cleanly and cached its result.
    expect(preloaded?.some((match) => match.routeId === fooRoute.id)).toBe(true)
    expect(
      router.stores.cachedMatches
        .get()
        .some(
          (match) =>
            match.routeId === fooRoute.id && match.status === 'success',
        ),
    ).toBe(true)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  } finally {
    consoleErrorSpy.mockRestore()
  }
})
