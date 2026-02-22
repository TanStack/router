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
} from '../src'
import { getIntersectionObserverMock } from './utils'

const ioObserveMock = vi.fn()
const ioDisconnectMock = vi.fn()

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

describe('Link', () => {
  test('when a Link is disabled', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>Index</h1>
          <Link to="/posts" disabled>
            Posts
          </Link>
        </>
      ),
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(postsLink)

    // Should still be on index
    expect(await screen.findByText('Index')).toBeInTheDocument()
  })

  test('when the current route is the root', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>Index</h1>
          <Link to="/" activeProps={{ className: 'active' }}>
            Index
          </Link>
          <Link to="/posts" inactiveProps={{ className: 'inactive' }}>
            Posts
          </Link>
        </>
      ),
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const indexLink = await screen.findByRole('link', { name: 'Index' })
    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(indexLink).toHaveAttribute('class', 'active')
    expect(postsLink).toHaveAttribute('class', 'inactive')
  })

  test('navigates on click', async () => {
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <Outlet />
        </>
      ),
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <div>
          <h1>Index</h1>
          <Link to="/posts">Go to Posts</Link>
        </div>
      ),
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts page</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const link = await screen.findByText('Go to Posts')
    fireEvent.click(link)

    const postsPage = await screen.findByText('Posts page')
    expect(postsPage).toBeInTheDocument()
  })

  test('Link with search params', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Link to="/posts" search={{ page: 2 }}>
          Posts Page 2
        </Link>
      ),
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      validateSearch: (search: Record<string, unknown>) => ({
        page: Number(search.page ?? 1),
      }),
      component: () => {
        const search = postsRoute.useSearch()
        return <div>Page: {search.page}</div>
      },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(<RouterProvider router={router} />)

    const link = await screen.findByText('Posts Page 2')
    fireEvent.click(link)

    const pageText = await screen.findByText('Page: 2')
    expect(pageText).toBeInTheDocument()
  })
})
