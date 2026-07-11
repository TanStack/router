import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
import { createMemoryHistory } from '@tanstack/history'
import { createControlledPromise } from '@tanstack/router-core'
import { hydrate as hydrateRouter } from '@tanstack/router-core/ssr/client'
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
  window.$_TSR = undefined
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
  // Exercise the real path that settles active match readiness while leaving
  // this published snapshot pending.
  router.cancelMatches()

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('pending-ui')).toBeTruthy()
  expect(screen.queryByTestId('slow-content')).toBeNull()
})

test('hydration display match keeps rendering pending UI after mount', async () => {
  const loaderGate = createControlledPromise<void>()
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const slowRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    ssr: false,
    loader: () => loaderGate,
    pendingComponent: () => <div data-testid="pending-ui">Pending</div>,
    component: () => <div data-testid="slow-content">Slow content</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([slowRoute]),
    history: createMemoryHistory({ initialEntries: ['/slow'] }),
  })
  const matches = router.matchRoutes(router.latestLocation)

  window.$_TSR = {
    router: {
      manifest: { routes: {} },
      dehydratedData: {},
      lastMatchId: matches[0]!.id,
      matches: [
        {
          i: matches[0]!.id,
          s: 'success',
          ssr: true,
          u: Date.now(),
        },
      ],
    },
    h: vi.fn(),
    e: vi.fn(),
    c: vi.fn(),
    p: vi.fn(),
    buffer: [],
    initialized: false,
  }

  await hydrateRouter(router)

  render(<RouterProvider router={router} />)

  expect(await screen.findByTestId('pending-ui')).toBeTruthy()
  expect(screen.queryByTestId('slow-content')).toBeNull()

  loaderGate.resolve()
  await router.latestLoadPromise

  expect(await screen.findByTestId('slow-content')).toBeTruthy()
  expect(screen.queryByTestId('pending-ui')).toBeNull()
})
