import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

// https://github.com/TanStack/router/issues/7753
// MatchInner can throw undefined when a redirected match's loadPromise was
// already cleared — escapes CatchBoundary and unmounts the whole app.
//
// The race: an async beforeLoad throws redirect(), pending UI renders
// (defaultPendingMs: 0), and by the time MatchInner re-renders with
// status === 'redirected', the loadPromise has been resolved and cleared
// by load-matches.ts. Throwing undefined escapes CatchBoundary (falsy
// check) and unmounts the app with a white screen.
test('redirected match with cleared loadPromise does not throw undefined', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })

  const slowRedirectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: async () => {
      // Simulate an async operation (e.g. token refresh) that takes long
      // enough for pending UI to commit and the loadPromise to be cleared
      await sleep(50)
      throw redirect({ to: '/target', replace: true })
    },
    component: () => <div data-testid="source">Source</div>,
  })

  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
    component: () => <div data-testid="target">Target</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([slowRedirectRoute, targetRoute]),
    defaultPendingMs: 0,
    defaultPendingComponent: () => <div data-testid="pending">loading</div>,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  // Should land on the target route, not white-screen
  expect(
    await screen.findByTestId('target', undefined, { timeout: 5_000 }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/target')
  // No console.error means CatchBoundary didn't receive an uncaught throw
  expect(consoleError).not.toHaveBeenCalled()
})

// A more aggressive variant: multiple async beforeLoad redirects in a chain,
// where each intermediate match's loadPromise may be cleared before the
// next render. This exercises the race more broadly.
test('chained async beforeLoad redirects with pending UI do not throw undefined', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })

  const firstRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: async () => {
      await sleep(20)
      throw redirect({ to: '/middle', replace: true })
    },
    component: () => <div data-testid="first">First</div>,
  })

  const middleRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: '/middle',
    beforeLoad: async () => {
      await sleep(30)
      throw redirect({ to: '/final', replace: true })
    },
    component: () => <div data-testid="middle">Middle</div>,
  })

  const finalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/final',
    component: () => <div data-testid="final">Final</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([firstRedirect, middleRedirect, finalRoute]),
    defaultPendingMs: 0,
    defaultPendingComponent: () => <div data-testid="pending">loading</div>,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  expect(
    await screen.findByTestId('final', undefined, { timeout: 5_000 }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/final')
  expect(consoleError).not.toHaveBeenCalled()
})
