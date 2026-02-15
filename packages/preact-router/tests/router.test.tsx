import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('Router', () => {
  test('renders the root route', async () => {
    const rootRoute = createRootRoute({
      component: () => <div>Root</div>,
    })
    const routeTree = rootRoute.addChildren([])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const rootElement = await screen.findByText('Root')
    expect(rootElement).toBeInTheDocument()
  })

  test('renders the index route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const indexElement = await screen.findByText('Index page')
    expect(indexElement).toBeInTheDocument()
  })

  test('renders a nested route', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <div>About page</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/about'] }),
    })

    render(<RouterProvider router={router} />)

    const aboutElement = await screen.findByText('About page')
    expect(aboutElement).toBeInTheDocument()
  })

  test('renders deeply nested routes', async () => {
    const rootRoute = createRootRoute()
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      component: () => (
        <div>
          Parent
          <Outlet />
        </div>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      component: () => <div>Child</div>,
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    render(<RouterProvider router={router} />)

    const parentElement = await screen.findByText('Parent')
    expect(parentElement).toBeInTheDocument()
    const childElement = await screen.findByText('Child')
    expect(childElement).toBeInTheDocument()
  })
})

// Need Outlet import
import { Outlet } from '../src'
