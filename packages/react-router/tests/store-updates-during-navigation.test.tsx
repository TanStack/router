import { afterEach, describe, expect, test, vi } from 'vitest'
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

function setup({
  RootComponent,
  beforeLoad,
  loader,
  defaultPendingMs,
  defaultPendingMinMs,
}: {
  RootComponent: RouteComponent
  beforeLoad?: () => any
  loader?: () => any
  defaultPendingMs?: number,
  defaultPendingMinMs?: number,
}) {
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
    beforeLoad,
    loader,
    component: () => <h1>PostsTitle</h1>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    defaultPendingMs,
    defaultPendingMinMs,
    defaultPendingComponent: () => <p>Loading...</p>,
  })

  return render(<RouterProvider router={router} />)
}

describe('Store doesn\'t update *too many* times during navigation', () => {
  test("everything (async loader, async beforeLoad, pendingMs)", async () => {
    const select = vi.fn()

    setup({
      RootComponent: () => {
        useRouterState({ select })
        return <Outlet />
      },
      beforeLoad: () =>
        new Promise<void>((resolve) => setTimeout(resolve, 100)),
      loader: () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
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

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(after - before).toBe(16)
  })

  test('sync beforeLoad', async () => {
    const select = vi.fn()

    setup({
      RootComponent: () => {
        useRouterState({ select })
        return <Outlet />
      },
      beforeLoad: () => { },
      loader: () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
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

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(after - before).toBe(15)
  })
})
