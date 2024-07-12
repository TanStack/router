import { afterEach, describe, expect, it, test, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
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
        <React.Fragment>
          <h1>IndexTitle</h1>
          <Link to="/posts">Posts</Link>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)
  }

  describe('when match is found', () => {
    test.each([true, false, undefined])(
      'returns the match if shouldThrow = %s',
      async (shouldThrow) => {
        function RootComponent() {
          const match = useMatch({ from: '/posts', shouldThrow })
          expect(match).toBeDefined()
          expect(match!.routeId).toBe('/posts')
          return <Outlet />
        }

        setup({
          RootComponent,
          history: createMemoryHistory({ initialEntries: ['/posts'] }),
        })
        await screen.findByText('PostsTitle')
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
        expect(
          await screen.findByText(
            'Invariant failed: Could not find an active match from "/posts"',
          ),
        ).toBeInTheDocument()
      },
    )

    describe('returns undefined if shouldThrow = false', () => {
      test('without select function', async () => {
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false })
          expect(match).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
      })
      test('with select function', async () => {
        const select = vi.fn()
        function RootComponent() {
          const match = useMatch({ from: 'posts', shouldThrow: false, select })
          expect(match).toBeUndefined()
          return <Outlet />
        }
        setup({ RootComponent })
        expect(await screen.findByText('IndexTitle')).toBeInTheDocument()
        expect(select).not.toHaveBeenCalled()
      })
    })
  })
})
