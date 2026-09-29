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
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <p>Link failed</p> : this.props.children
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('a Link search updater error belongs to its render boundary during navigation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const rootRoute = createRootRoute({
    validateSearch: (search) => ({ fail: search.fail === true }),
    component: () => (
      <>
        <LinkErrorBoundary>
          <Link
            to="/next"
            search={(previous: { fail?: boolean }) => {
              if (previous.fail) {
                throw new Error('Link destination failed')
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
  expect(screen.getByText('Next page')).toBeInTheDocument()
  expect(router.state.status).toBe('idle')
})
