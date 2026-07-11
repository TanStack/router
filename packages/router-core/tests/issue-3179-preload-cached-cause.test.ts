import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #3179: with preload enabled, hovering a link used to re-run the
 * route loader with the `cause` value frozen on the cached/active match
 * generation ('enter' instead of 'preload'), and hovering a link to the
 * currently active route re-ran the loader on every hover.
 *
 * Desired behavior:
 * - Hovering a link to the currently active route runs no loader at all
 *   (the preload borrows the fresh active matches read-only).
 * - When a preload does run a loader (here forced via preloadStaleTime: 0
 *   on a cached match), the loader sees cause 'preload' and preload true,
 *   never the cause cached on the old match generation.
 * - A real navigation still reports its own cause ('enter').
 */

function setup() {
  const causes: Array<string> = []
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    // Force hover preloads of the cached match to actually re-run the
    // loader so we can observe the cause it receives.
    preloadStaleTime: 0,
    loader: ({ cause, preload }) => {
      causes.push(`index cause=${cause} preload=${preload}`)
    },
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return { router, causes }
}

test('hovering the currently active route does not re-run its loader', async () => {
  const { router, causes } = setup()

  await router.load()
  expect(causes).toEqual(['index cause=enter preload=false'])
  causes.length = 0

  await router.preloadRoute({ to: '/' } as any)
  expect(causes).toEqual([])
})

test('a preload reload of a cached match reports cause preload, not the cached cause', async () => {
  const { router, causes } = setup()

  await router.load()
  await router.navigate({ to: '/about' } as any)
  await router.latestLoadPromise
  causes.length = 0

  // The index match now lives in the cache with its old cause ('enter').
  // Hover-preloading it must report cause 'preload', not leak the cached
  // generation's cause.
  await router.preloadRoute({ to: '/' } as any)
  expect(causes).toEqual(['index cause=preload preload=true'])
  causes.length = 0

  // A real navigation still reports its own cause.
  await router.navigate({ to: '/' } as any)
  await router.latestLoadPromise
  expect(causes).toEqual(['index cause=enter preload=false'])
})
