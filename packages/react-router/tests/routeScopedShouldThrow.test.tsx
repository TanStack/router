import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

describe('Route.useSearch', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const route = {} as {
      current: ReturnType<typeof createPostsRouter>['postsRoute']
    }

    function RootComponent() {
      const search = route.current.useSearch({ shouldThrow: false })
      expect(search).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    route.current = created.postsRoute
    render(<RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })

  test.each([undefined, true])(
    'throws when the target route is inactive and shouldThrow is %s',
    async (shouldThrow) => {
      const route = {} as {
        current: ReturnType<typeof createPostsRouter>['postsRoute']
      }

      function RootComponent() {
        route.current.useSearch({ shouldThrow })
        return <Outlet />
      }

      const created = createPostsRouter(RootComponent)
      route.current = created.postsRoute
      render(<RouterProvider router={created.router} />)
      const postsError = await screen.findByText(
        'Invariant failed: Could not find an active match from "/posts/$postId"',
      )
      expect(postsError).toBeInTheDocument()
    },
  )
})

describe('Route.useParams', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const route = {} as {
      current: ReturnType<typeof createPostsRouter>['postsRoute']
    }

    function RootComponent() {
      const params = route.current.useParams({ shouldThrow: false })
      expect(params).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    route.current = created.postsRoute
    render(<RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })

  test.each([undefined, true])(
    'throws when the target route is inactive and shouldThrow is %s',
    async (shouldThrow) => {
      const route = {} as {
        current: ReturnType<typeof createPostsRouter>['postsRoute']
      }

      function RootComponent() {
        route.current.useParams({ shouldThrow })
        return <Outlet />
      }

      const created = createPostsRouter(RootComponent)
      route.current = created.postsRoute
      render(<RouterProvider router={created.router} />)
      const postsError = await screen.findByText(
        'Invariant failed: Could not find an active match from "/posts/$postId"',
      )
      expect(postsError).toBeInTheDocument()
    },
  )
})

describe('RouteApi.useSearch', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const postsRouteApi = getRouteApi('/posts/$postId')

    function RootComponent() {
      const search = postsRouteApi.useSearch({ shouldThrow: false })
      expect(search).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    render(<RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })
})

describe('RouteApi.useParams', () => {
  test('returns undefined when the target route is inactive and shouldThrow is false', async () => {
    const postsRouteApi = getRouteApi('/posts/$postId')

    function RootComponent() {
      const params = postsRouteApi.useParams({ shouldThrow: false })
      expect(params).toBeUndefined()
      return <Outlet />
    }

    const created = createPostsRouter(RootComponent)
    render(<RouterProvider router={created.router} />)
    expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
  })
})
