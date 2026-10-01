import React from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('removing a legacy notFoundRoute updates destinations outside the active path', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/missing">Missing page</Link>
        <Outlet />
      </>
    ),
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
  })
  const legacyNotFound = createRoute({
    getParentRoute: () => rootRoute,
    path: '/404',
    search: {
      middlewares: [({ search, next }) => ({ ...next(search), tag: 'legacy' })],
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    notFoundRoute: legacyNotFound,
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Missing page' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  expect(link).toHaveAttribute('href', '/missing?tag=legacy')

  router.update({ notFoundRoute: undefined })
  await act(() => router.navigate({ to: '/home', hash: 'after' }))

  expect(router.state.location.pathname).toBe('/home')
  expect(link).toHaveAttribute('href', '/missing')
})
