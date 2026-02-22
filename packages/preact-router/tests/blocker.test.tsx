import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import {
  Block,
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
})

describe('Block component', () => {
  test('blocks navigation with shouldBlockFn returning true', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Block shouldBlockFn={() => true}>
          <div>
            <h1>Home</h1>
            <Link to="/about">Go to About</Link>
          </div>
        </Block>
      ),
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

    // Navigation should be blocked
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  test('does not block when shouldBlockFn returns false', async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Block shouldBlockFn={() => false}>
          <div>
            <h1>Home</h1>
            <Link to="/about">Go to About</Link>
          </div>
        </Block>
      ),
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
