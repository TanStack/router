import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// https://github.com/TanStack/router/issues/7773
test('pendingComponent: false suppresses the router-wide default pending fallback', async () => {
  const loaderGate = createControlledPromise<string>()
  const rootRoute = createRootRoute({ component: Outlet })
  const optedOutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/opted-out',
    pendingComponent: false,
    loader: () => loaderGate,
    component: () => (
      <div data-testid="content">{optedOutRoute.useLoaderData()}</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([optedOutRoute]),
    history: createMemoryHistory({ initialEntries: ['/opted-out'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 100,
  })

  render(<RouterProvider router={router} />)
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  await act(async () => {
    loaderGate.resolve('loaded')
    await loaderGate
  })

  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('loaded')
})

// Contrast case: confirms the type widening didn't disturb default inheritance
// for routes that don't opt out.
test('a sibling route without pendingComponent: false still uses the router-wide default', async () => {
  vi.useFakeTimers()

  const loaderGate = createControlledPromise<string>()
  const rootRoute = createRootRoute({ component: Outlet })
  const defaultRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/default',
    loader: () => loaderGate,
    component: () => (
      <div data-testid="content">{defaultRoute.useLoaderData()}</div>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([defaultRoute]),
    history: createMemoryHistory({ initialEntries: ['/default'] }),
    defaultPendingComponent: () => <div data-testid="pending">Pending</div>,
    defaultPendingMs: 0,
    defaultPendingMinMs: 100,
  })

  render(<RouterProvider router={router} />)
  expect(screen.getByTestId('pending')).toBeInTheDocument()
  expect(screen.queryByTestId('content')).not.toBeInTheDocument()

  loaderGate.resolve('loaded')

  // pendingMinMs (100) hasn't elapsed yet -- the default fallback must stay up.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(99)
  })
  expect(screen.getByTestId('pending')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
  expect(screen.getByTestId('content')).toHaveTextContent('loaded')
})
