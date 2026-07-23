import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
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
          const match = useMatch({ from: '/posts', shouldThrow })
          // In Solid, createMemo is lazy - we must call the accessor to trigger the invariant
          match()
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

  test('route-scoped useParams should remain readable from async work created by the route during navigation away', async () => {
    let releaseDelayedRead: () => void = () => {}
    const delayedReadGate = new Promise<void>((resolve) => {
      releaseDelayedRead = resolve
    })
    let delayedRead!: Promise<void>
    let delayedError: unknown

    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    })
    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      component: function PostComponent() {
        const params = postRoute.useParams()

        delayedRead = delayedReadGate.then(() => {
          try {
            params()
          } catch (err) {
            delayedError = err
          }
        })

        return <h1>Post {params().postId}</h1>
      },
    })
    const otherRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
      component: () => <h1>OtherTitle</h1>,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([postRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts/one'] }),
    })

    render(() => <RouterProvider router={router} />)
    expect(await screen.findByText('Post one')).toBeInTheDocument()

    await router.navigate({ to: '/other' })
    expect(await screen.findByText('OtherTitle')).toBeInTheDocument()

    releaseDelayedRead()
    await delayedRead

    if (delayedError) {
      throw new Error(
        `Route-scoped useParams threw after navigation away: ${
          delayedError instanceof Error
            ? delayedError.message
            : String(delayedError)
        }`,
      )
    }
  })
})
