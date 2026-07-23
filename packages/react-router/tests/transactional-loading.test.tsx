import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('transactional route loading', () => {
  test('renders a leaf error at the leaf boundary when its background refresh fails', async () => {
    let loads = 0
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <div>Root shell</div>
          <Outlet />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <Link to="/parent/child">Open child</Link>,
    })
    const parentRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      component: () => (
        <>
          <div>Parent shell</div>
          <Outlet />
        </>
      ),
    })
    const childRoute = createRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: {
        staleReloadMode: 'background',
        handler: () => {
          loads++
          if (loads > 1) {
            throw new Error('background refresh failed')
          }
          return 'child data'
        },
      },
      component: () => <div>{childRoute.useLoaderData()}</div>,
      errorComponent: () => <div>Child refresh failed</div>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history,
    })

    render(<RouterProvider router={router} />)
    fireEvent.click(await screen.findByText('Open child'))
    expect(await screen.findByText('child data')).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.status).toBe('idle')
      expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
    })

    await act(() => router.invalidate())

    expect(await screen.findByText('Child refresh failed')).toBeInTheDocument()
    expect(screen.getByText('Root shell')).toBeInTheDocument()
    expect(screen.getByText('Parent shell')).toBeInTheDocument()
  })
})
