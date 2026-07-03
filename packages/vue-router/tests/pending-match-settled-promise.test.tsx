import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

/**
 * A pending match whose match-local loadPromise was settled/removed is a
 * legitimate state: hydrate() settles the display match's promise while
 * keeping it pending (_displayPending), and cancelMatches() settles every
 * active match's promise at the start of each load. MatchInner must render
 * pending UI for such a snapshot instead of hitting a dev invariant.
 */

afterEach(() => {
  cleanup()
})

function setup() {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const slowRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    pendingMinMs: 100,
    loader: () => new Promise<void>(() => {}),
    pendingComponent: () => <div data-testid="pending-ui">Pending</div>,
    component: () => <div data-testid="slow-content">Slow content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([slowRoute]),
    history: createMemoryHistory({ initialEntries: ['/slow'] }),
    defaultPendingMs: 0,
  })
  return { router, slowRoute }
}

test('pending match with a settled loadPromise renders the pending component without crashing', async () => {
  const { router, slowRoute } = setup()
  router.stores.setMatches(router.matchRoutes(router.latestLocation))

  const match = router.stores.matches
    .get()
    .find((m) => m.routeId === slowRoute.id)!
  expect(match.status).toBe('pending')
  // Simulate hydrate()/cancelMatches() settling the match-local promise while
  // the match stays pending.
  match._.loadPromise = undefined

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('pending-ui')).toBeTruthy()
})

test('hydration display match keeps rendering pending UI after mount', async () => {
  const { router, slowRoute } = setup()
  router.stores.setMatches(router.matchRoutes(router.latestLocation))

  const match = router.stores.matches
    .get()
    .find((m) => m.routeId === slowRoute.id)!
  match._displayPending = true
  match._.loadPromise = undefined

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('pending-ui')).toBeTruthy()
  expect(screen.queryByTestId('slow-content')).toBeNull()
})
