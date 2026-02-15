import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('Matches', () => {
  test('renders the match tree correctly', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <h1>Root</h1>
          <Outlet />
        </div>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index Content</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Root')).toBeInTheDocument()
    expect(await screen.findByText('Index Content')).toBeInTheDocument()
  })

  test('renders nested match tree', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <div>
          <Outlet />
        </div>
      ),
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      component: () => (
        <div>
          <span>Parent</span>
          <Outlet />
        </div>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      component: () => <span>Child</span>,
    })
    const routeTree = rootRoute.addChildren([
      parentRoute.addChildren([childRoute]),
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Parent')).toBeInTheDocument()
    expect(await screen.findByText('Child')).toBeInTheDocument()
  })
})
