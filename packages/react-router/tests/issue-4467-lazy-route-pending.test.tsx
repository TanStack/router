import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createLazyRoute,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

// https://github.com/TanStack/router/issues/4467
test('default pending component renders while lazy route options load', async () => {
  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Index page</h1>,
  })
  const lazyPageOptions = createLazyRoute('/page')({
    component: () => <h1>Page</h1>,
  })
  const lazyOptions = createControlledPromise<typeof lazyPageOptions>()
  const loadLazyOptions = vi.fn(() => lazyOptions)
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/page',
  }).lazy(loadLazyOptions)
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => <p role="status">Loading page</p>,
  })
  let navigationPromise: Promise<void> | undefined

  try {
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: 'Index page' }),
    ).toBeInTheDocument()

    act(() => {
      navigationPromise = router.navigate({ to: '/page' })
    })

    expect(await screen.findByRole('status')).toHaveTextContent('Loading page')
    expect(
      screen.queryByRole('heading', { name: 'Page' }),
    ).not.toBeInTheDocument()
    expect(lazyOptions.status).toBe('pending')
    expect(loadLazyOptions).toHaveBeenCalledTimes(1)

    await act(async () => {
      lazyOptions.resolve(lazyPageOptions)
      await navigationPromise
    })

    expect(screen.getByRole('heading', { name: 'Page' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(loadLazyOptions).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => {
      if (lazyOptions.status === 'pending') {
        lazyOptions.resolve(lazyPageOptions)
      }
      await navigationPromise
    })
  }
})
