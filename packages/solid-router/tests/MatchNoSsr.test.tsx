import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

describe('ssr: data-only with pendingComponent', () => {
  it('should render the route component after hydration instead of staying stuck on pendingComponent', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: 'data-only',
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    render(() => <RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  it('should render the route component with ssr: false and pendingComponent', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: false,
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    render(() => <RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  it('should work with defaultPendingComponent when using ssr: data-only', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      ssr: 'data-only',
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultPendingComponent: () => (
        <div data-testid="default-pending">Default Loading...</div>
      ),
    })

    await router.load()
    render(() => <RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  it('should render normally without ssr option (baseline)', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      pendingComponent: () => (
        <div data-testid="pending">Loading...</div>
      ),
      loader: async () => {
        return { message: 'loaded' }
      },
      component: () => <div data-testid="content">Route Content</div>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    render(() => <RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })
})
