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

// https://github.com/TanStack/router/issues/7367
// Root route shows a spinner immediately (pendingMs: 0) while beforeLoad
// decides where to send the user, keeps it up for pendingMinMs, and then
// redirects. This used to crash in MatchInnerImpl (white screen) because the
// redirected match was rendered/thrown after its loadPromise was cleared.
test('immediate pending spinner (pendingMs: 0 + pendingMinMs) with root beforeLoad redirect renders the target without render errors', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let hasRedirected = false

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    pendingMs: 0,
    pendingMinMs: 100,
    pendingComponent: () => <div data-testid="pending">loading</div>,
    errorComponent: ({ error }) => (
      <pre data-testid="root-error">{String(error)}</pre>
    ),
    beforeLoad: async () => {
      await sleep(50)
      if (!hasRedirected) {
        hasRedirected = true
        throw redirect({ to: '/welcome', replace: true })
      }
    },
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="index-page">Index</div>,
  })

  const welcomeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/welcome',
    component: () => <div data-testid="welcome-page">Welcome</div>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, welcomeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(<RouterProvider router={router} />)

  // pendingMs: 0 — the spinner must show right away.
  expect(await screen.findByTestId('pending')).toBeInTheDocument()

  // The redirect must complete: the target renders, no error boundary output
  // and no render crash.
  expect(
    await screen.findByTestId('welcome-page', undefined, { timeout: 5_000 }),
  ).toBeInTheDocument()
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('root-error')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/welcome')
  await vi.waitFor(() => expect(router.state.status).toBe('idle'))
  expect(consoleError).not.toHaveBeenCalled()
})
