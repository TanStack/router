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

class LinkErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? <p>Link failed</p> : this.props.children
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test.each([new Error('Link destination failed'), undefined, null, false, 0])(
  'a Link search updater error (%s) belongs to its render boundary during navigation',
  async (error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const capture = vi.fn()
    const rootRoute = createRootRoute({
      validateSearch: (search) => ({ fail: search.fail === true }),
      component: () => (
        <>
          <LinkErrorBoundary onError={capture}>
            <Link
              to="/next"
              search={(previous: { fail?: boolean }) => {
                if (previous.fail) {
                  throw error
                }
                return previous
              }}
            >
              Next link
            </Link>
          </LinkErrorBoundary>
          <Outlet />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <p>Index page</p>,
    })
    const nextRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/next',
      component: () => <p>Next page</p>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('link', { name: 'Next link' })
    await waitFor(() => expect(router.state.status).toBe('idle'))

    await act(async () => {
      await router.navigate({ to: '/next', search: { fail: true } })
    })

    expect(await screen.findByText('Link failed')).toBeInTheDocument()
    expect(capture).toHaveBeenCalled()
    expect(capture.mock.calls[0]?.[0]).toBe(error)
    expect(screen.getByText('Next page')).toBeInTheDocument()
    expect(router.state.status).toBe('idle')
  },
)
