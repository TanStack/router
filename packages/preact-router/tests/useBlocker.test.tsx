import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
} from '../src'

afterEach(() => {
  cleanup()
})

describe('useBlocker', () => {
  test('does not block when condition is false', async () => {
    function UnblockedComponent() {
      useBlocker({ shouldBlockFn: () => false })

      return (
        <div>
          <h1>Home</h1>
          <Link to="/about">Go to About</Link>
        </div>
      )
    }

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: UnblockedComponent,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Go to About'))

    expect(await screen.findByText('About')).toBeInTheDocument()
  })

  test('blocks navigation when shouldBlockFn returns true (non-resolver)', async () => {
    function BlockedComponent() {
      useBlocker({ shouldBlockFn: () => true })

      return (
        <div>
          <h1>Home</h1>
          <Link to="/about">Go to About</Link>
        </div>
      )
    }

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: BlockedComponent,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Go to About'))

    // Should still be on home since navigation is blocked
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  test('does not block when disabled is true', async () => {
    function BlockedComponent() {
      useBlocker({ shouldBlockFn: () => true, disabled: true })

      return (
        <div>
          <h1>Home</h1>
          <Link to="/about">Go to About</Link>
        </div>
      )
    }

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: BlockedComponent,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => <h1>About</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Go to About'))

    expect(await screen.findByText('About')).toBeInTheDocument()
  })
})
