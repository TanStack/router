import { afterEach, describe, expect, test, vi } from 'vitest'
import * as Solid from 'solid-js'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useMatch,
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

    return render(() => <RouterProvider router={router} />)
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          const match = useMatch({ from: '/posts', shouldThrow })
          expect(match()).toBeDefined()
          expect(match()!.routeId).toBe('/posts')
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
          expect(match()).toBeUndefined()
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
          expect(match()).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        const indexTitle = await screen.findByText('IndexTitle')
        expect(indexTitle).toBeInTheDocument()
        expect(select).not.toHaveBeenCalled()
      })
    })
  })

  // Pins the Vue/React-matching semantics: a `useMatch({ from })` mounted while
  // the target route is only in the pending pool (loader in flight, before
  // pending publication) does not observe an active match — it resolves to
  // `undefined` (or throws with the default `shouldThrow`) exactly as at idle,
  // then resolves once the navigation commits. There is no throw-suppression /
  // stale-value window during the navigation.
  describe('when the target route is only in the pending pool', () => {
    test('({ from }) returns undefined while pending, then resolves after commit', async () => {
      let resolveLoader!: () => void
      const loaderGate = new Promise<void>((resolve) => {
        resolveLoader = resolve
      })

      const seenRouteIds: Array<string | undefined> = []

      const rootRoute = createRootRoute({
        component: () => {
          const match = useMatch({ from: '/posts', shouldThrow: false })
          Solid.createEffect(() => {
            seenRouteIds.push(match()?.routeId)
          })
          return (
            <>
              <Link to="/posts">Posts</Link>
              <Outlet />
            </>
          )
        },
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <h1>IndexTitle</h1>,
      })
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
        loader: () => loaderGate,
        component: () => <h1>PostsTitle</h1>,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      render(() => <RouterProvider router={router} />)

      // Idle at index: /posts has no active match.
      await screen.findByText('IndexTitle')
      expect(seenRouteIds).toEqual([undefined])

      // Navigate; the gated loader keeps /posts in the pending pool (default
      // pendingMs is 1000ms, so no pending publication within this window).
      fireEvent.click(screen.getByRole('link', { name: 'Posts' }))
      await new Promise((resolve) => setTimeout(resolve, 50))

      // The target is only pending — useMatch({ from }) never sees it as active.
      expect(seenRouteIds).not.toContain('/posts')

      // Commit the navigation.
      resolveLoader()
      await screen.findByText('PostsTitle')
      await waitFor(() => {
        expect(seenRouteIds.at(-1)).toBe('/posts')
      })
    })
  })
})
