import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A failed descendant preload must not discard its successful ancestors'
 * work: the leading run of success matches is cached (within
 * preloadStaleTime) so repeated hovers do not re-run expensive ancestor
 * loaders. The failed match itself is never cached.
 */

function setup(failure: 'notFound' | 'error') {
  const aLoader = vi.fn(() => 'a data')
  const bLoader = vi.fn(() => 'b data')
  const cLoader = vi.fn(() => {
    if (failure === 'notFound') {
      throw notFound()
    }
    throw new Error('c failed')
  })

  const rootRoute = new BaseRootRoute({})
  const aRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
    loader: aLoader,
  })
  const bRoute = new BaseRoute({
    getParentRoute: () => aRoute,
    path: '/b',
    loader: bLoader,
  })
  const cRoute = new BaseRoute({
    getParentRoute: () => bRoute,
    path: '/c',
    loader: cLoader,
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      aRoute.addChildren([bRoute.addChildren([cRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return { router, aLoader, bLoader, cLoader, aRoute, bRoute, cRoute }
}

describe.each(['notFound', 'error'] as const)(
  'preload with %s descendant',
  (failure) => {
    test('caches the successful ancestor prefix and not the failed match', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)

      try {
        const { router, aLoader, bLoader, cLoader, aRoute, bRoute, cRoute } =
          setup(failure)

        await router.preloadRoute({ to: '/a/b/c' } as any)

        expect(aLoader).toHaveBeenCalledTimes(1)
        expect(bLoader).toHaveBeenCalledTimes(1)
        expect(cLoader).toHaveBeenCalledTimes(1)

        const cached = router.stores.cachedMatches.get()
        expect(cached.some((match) => match.routeId === aRoute.id)).toBe(true)
        expect(cached.some((match) => match.routeId === bRoute.id)).toBe(true)
        expect(cached.some((match) => match.routeId === cRoute.id)).toBe(false)

        // A second hover reuses the cached ancestors (fresh within
        // preloadStaleTime) and only retries the failed descendant.
        await router.preloadRoute({ to: '/a/b/c' } as any)

        expect(aLoader).toHaveBeenCalledTimes(1)
        expect(bLoader).toHaveBeenCalledTimes(1)
        expect(cLoader).toHaveBeenCalledTimes(2)
      } finally {
        consoleError.mockRestore()
      }
    })
  },
)
