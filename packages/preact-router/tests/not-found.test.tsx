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

describe('Not Found', () => {
  test('renders notFoundComponent on root route when no match', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
      notFoundComponent: () => <div>Page not found!</div>,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/does-not-exist'] }),
    })

    render(<RouterProvider router={router} />)

    const notFound = await screen.findByText('Page not found!')
    expect(notFound).toBeInTheDocument()
  })

  test('renders defaultNotFoundComponent when no route-level handler', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div>Index</div>,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/does-not-exist'] }),
      defaultNotFoundComponent: () => <div>Default 404</div>,
    })

    render(<RouterProvider router={router} />)

    const notFound = await screen.findByText('Default 404')
    expect(notFound).toBeInTheDocument()
  })
})
