import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '../src'

afterEach(() => {
  cleanup()
})

test('useParams returns params for the current route', async () => {
  const rootRoute = createRootRoute()
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: () => (
      <div>
        <h1>Posts</h1>
        <Outlet />
      </div>
    ),
  })
  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    component: PostComponent,
  })

  function PostComponent() {
    const params = useParams({ from: postRoute.fullPath })
    return (
      <div>
        <span data-testid="post-id">{params.postId}</span>
      </div>
    )
  }

  const routeTree = rootRoute.addChildren([
    postsRoute.addChildren([postRoute]),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/posts/123'] }),
  })

  render(<RouterProvider router={router} />)

  await act(() => router.load())

  const postId = await screen.findByTestId('post-id')
  expect(postId.textContent).toBe('123')
})

test('useParams with parsed params', async () => {
  const rootRoute = createRootRoute()
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: () => (
      <div>
        <Outlet />
      </div>
    ),
  })
  const postRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: '$postId',
    params: {
      parse: (params) => ({
        ...params,
        postId: params.postId === 'one' ? '1' : params.postId,
      }),
    },
    component: PostComponent,
  })

  function PostComponent() {
    const params = useParams({ from: postRoute.fullPath })
    return <span data-testid="post-id">{params.postId}</span>
  }

  const routeTree = rootRoute.addChildren([
    postsRoute.addChildren([postRoute]),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/posts/one'] }),
  })

  render(<RouterProvider router={router} />)

  await act(() => router.load())

  const postId = await screen.findByTestId('post-id')
  expect(postId.textContent).toBe('1')
})
