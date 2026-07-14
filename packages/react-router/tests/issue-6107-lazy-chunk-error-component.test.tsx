import * as React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
})

// https://github.com/TanStack/router/issues/6107
test('#6107: lazy chunk hover failure is non-fatal and navigation renders defaultErrorComponent', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const chunkError = new TypeError(
    'Failed to fetch dynamically imported module: /assets/posts.lazy.js',
  )
  let lazyCalls = 0

  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Link to="/posts" preload="intent">
          Posts
        </Link>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
  }).lazy(() => {
    lazyCalls++
    return Promise.reject(chunkError)
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPreload: 'intent',
    defaultPreloadDelay: 0,
    defaultErrorComponent: ({ error }) => (
      <div data-testid="default-error">{error.message}</div>
    ),
  })
  const preloadRoute = vi.spyOn(router, 'preloadRoute')

  render(<RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  const link = screen.getByRole('link', { name: 'Posts' })
  fireEvent.mouseOver(link)
  await waitFor(() => expect(preloadRoute).toHaveBeenCalledTimes(1))
  await preloadRoute.mock.results[0]?.value
  expect(lazyCalls).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('Index')).toBeInTheDocument()
  expect(screen.queryByTestId('default-error')).not.toBeInTheDocument()

  const callsAfterPreload = lazyCalls
  fireEvent.click(link)
  expect(await screen.findByTestId('default-error')).toHaveTextContent(
    chunkError.message,
  )
  expect(lazyCalls).toBeGreaterThan(callsAfterPreload)
  expect(router.state.location.pathname).toBe('/posts')
})
