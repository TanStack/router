import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
  useRouterState,
} from '../src'
import type { RouteComponent, RouterHistory } from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('useMatch', () => {
  function setup({
    RootComponent,
    history,
  }: {
    RootComponent: RouteComponent
    history?: RouterHistory
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
      component: () => <h1>PostsTitle</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    return render(<RouterProvider router={router} />)
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          const match = useMatch({ from: '/posts', shouldThrow })
          expect(match.value).toBeDefined()
          expect(match.value!.routeId).toBe('/posts')
          return <Outlet />
        }

        setup({
          RootComponent,
          history: createMemoryHistory({ initialEntries: ['/posts'] }),
        })
        const postsTitle = await screen.findByText('PostsTitle')
        expect(postsTitle).toBeInTheDocument()
      },
    )
  })

  describe('when match is not found', () => {
    test.each([undefined, true])(
      'throws if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          useMatch({ from: '/posts', shouldThrow })
          return <Outlet />
        }
        setup({ RootComponent })
        const postsError = await screen.findByText(
          'Invariant failed: Could not find an active match from "/posts"',
        )
        expect(postsError).toBeInTheDocument()
      },
    )

    describe('returns undefined if shouldThrow = false', () => {
      test('without select function', async () => {
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false })
          expect(match.value).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        expect(
          await waitFor(() => screen.findByText('IndexTitle')),
        ).toBeInTheDocument()
      })
      test('with select function', async () => {
        const select = vi.fn()
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false, select })
          expect(match.value).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        const indexTitle = await screen.findByText('IndexTitle')
        expect(indexTitle).toBeInTheDocument()
        expect(select).not.toHaveBeenCalled()
      })
    })
  })

  describe('pending transitions', () => {
    test('does not throw while transitioning to a pending matching route', async () => {
      let resolvePostsLoader!: () => void
      const postsLoaderPromise = new Promise<void>((resolve) => {
        resolvePostsLoader = resolve
      })

      function PendingProbe() {
        useMatch({ from: '/posts', shouldThrow: true })
        return null
      }

      function RootComponent() {
        const routerState = useRouterState()
        return (
          <>
            {routerState.value.status === 'pending' ? <PendingProbe /> : null}
            <Outlet />
          </>
        )
      }

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
        path: '/posts',
        loader: async () => {
          await postsLoaderPromise
        },
        component: () => <h1>PostsTitle</h1>,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      render(<RouterProvider router={router} />)

      await screen.findByText('IndexTitle')

      const navigation = router.navigate({ to: '/posts' })
      await waitFor(() => {
        expect(router.state.status).toBe('pending')
      })

      expect(
        screen.queryByText(
          'Invariant failed: Could not find an active match from "/posts"',
        ),
      ).not.toBeInTheDocument()

      resolvePostsLoader()
      await navigation
      expect(await screen.findByText('PostsTitle')).toBeInTheDocument()
    })

    test('still throws during pending transition when route is not pending', async () => {
      let resolveOtherLoader!: () => void
      const otherLoaderPromise = new Promise<void>((resolve) => {
        resolveOtherLoader = resolve
      })

      function PendingProbe() {
        useMatch({ from: '/posts', shouldThrow: true })
        return null
      }

      function RootComponent() {
        const routerState = useRouterState()
        return (
          <>
            {routerState.value.status === 'pending' ? <PendingProbe /> : null}
            <Outlet />
          </>
        )
      }

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
        path: '/posts',
        component: () => <h1>PostsTitle</h1>,
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        loader: async () => {
          await otherLoaderPromise
        },
        component: () => <h1>OtherTitle</h1>,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      render(<RouterProvider router={router} />)
      await screen.findByText('IndexTitle')

      const navigation = router.navigate({ to: '/other' }).catch(() => {})
      const errorText = await screen.findByText(
        'Invariant failed: Could not find an active match from "/posts"',
      )
      expect(errorText).toBeInTheDocument()

      resolveOtherLoader()
      await navigation
    })
  })
})
