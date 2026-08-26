import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  getRouteApi,
} from '../src'
import type { RouteComponent, RouterHistory } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

function createPostsRouter(
  RootComponent: RouteComponent,
  history?: RouterHistory,
) {
  const rootRoute = createRootRoute({
    component: RootComponent,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>IndexTitle</h1>,
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$postId',
    validateSearch: () => ({ page: 0 }),
    component: () => <h1>PostsTitle</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    history: history ?? createMemoryHistory({ initialEntries: ['/'] }),
  })

  return { postsRoute, router }
}

describe('RouteApi.useSearch', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const postsRouteApi = getRouteApi('/posts/$postId')

    function RootComponent() {
      const search = postsRouteApi.useSearch({ shouldThrow: false })
      expect(search()).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    render(() => <RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })
})

describe('RouteApi.useParams', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const postsRouteApi = getRouteApi('/posts/$postId')

    function RootComponent() {
      const params = postsRouteApi.useParams({ shouldThrow: false })
      expect(params()).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    render(() => <RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })
})

describe('RouteApi.useMatch', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const postsRouteApi = getRouteApi('/posts/$postId')

    function RootComponent() {
      const match = postsRouteApi.useMatch({ shouldThrow: false })
      expect(match()).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    render(() => <RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })
})
