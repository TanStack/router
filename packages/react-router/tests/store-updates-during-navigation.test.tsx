import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from '../src'
import type { RouteComponent } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

function setup({ RootComponent }: { RootComponent: RouteComponent }) {
  const rootRoute = createRootRoute({
    component: RootComponent,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <>
        <h1>IndexTitle</h1>
        <Link to="/posts">Posts</Link>
      </>
    ),
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    beforeLoad: () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
    loader: () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
    component: () => <h1>PostsTitle</h1>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    defaultPendingMs: 100,
    defaultPendingMinMs: 300,
    defaultPendingComponent: () => <p>Loading...</p>,
  })

  return render(<RouterProvider router={router} />)
}

describe('Store updates during navigation', () => {
  it("isn't called *too many* times", async () => {
    const select = vi.fn()

    setup({
      RootComponent: () => {
        useRouterState({ select })
        return <Outlet />
      },
    })

    // navigate to /posts
    const link = await waitFor(() =>
      screen.getByRole('link', { name: 'Posts' }),
    )
    const before = select.mock.calls.length
    act(() => link.click())
    const title = await waitFor(() => screen.getByText('PostsTitle'))
    expect(title).toBeInTheDocument()
    const after = select.mock.calls.length

    expect(after - before).toBe(19)
  })
})
