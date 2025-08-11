import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { z } from 'zod'
import {
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
} from '../src'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
  vi.resetAllMocks()
  cleanup()
})

describe('useBlocker', () => {
  test('does not block navigation when not enabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => false })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  test('does not block navigation when disabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => true, disabled: true })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  test('blocks navigation when enabled', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn: () => true })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  test('gives correct arguments to shouldBlockFn', async () => {
    const rootRoute = createRootRoute()

    const shouldBlockFn = vi.fn().mockReturnValue(true)

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts', replace: true })}>
            Posts
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    expect(shouldBlockFn).toHaveBeenCalledWith({
      action: 'REPLACE',
      current: {
        routeId: indexRoute.id,
        fullPath: indexRoute.fullPath,
        pathname: '/',
        params: {},
        search: {},
      },
      next: {
        routeId: postsRoute.id,
        fullPath: postsRoute.fullPath,
        pathname: '/posts',
        params: {},
        search: {},
      },
    })
  })

  test('gives correct arguments to shouldBlockFn with path and search params', async () => {
    const rootRoute = createRootRoute()

    const shouldBlockFn = vi.fn().mockReturnValue(true)

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker({ shouldBlockFn })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button
            onClick={() =>
              navigate({
                to: '/posts/$postId',
                params: { postId: '10' },
                search: { param1: 'foo', param2: 'bar' },
              })
            }
          >
            Posts
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      validateSearch: z.object({
        param1: z.string().default('param1-default'),
        param2: z.string().default('param2-default'),
      }),
      path: '/posts/$postId',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    expect(shouldBlockFn).toHaveBeenCalledWith({
      action: 'PUSH',
      current: {
        routeId: indexRoute.id,
        fullPath: indexRoute.fullPath,
        pathname: '/',
        params: {},
        search: {},
      },
      next: {
        routeId: postsRoute.id,
        fullPath: postsRoute.fullPath,
        pathname: '/posts/10',
        params: { postId: '10' },
        search: { param1: 'foo', param2: 'bar' },
      },
    })
  })

  test('conditionally blocking navigation works', async () => {
    const rootRoute = createRootRoute()

    const IndexComponent = () => {
      const navigate = useNavigate()

      useBlocker<Router>({
        shouldBlockFn: ({ next }) => {
          if (next.fullPath === '/posts') {
            return true
          }
          return false
        },
      })

      return (
        <>
          <h1>Index</h1>
          <button onClick={() => navigate({ to: '/' })}>Index</button>
          <button onClick={() => navigate({ to: '/posts' })}>Posts</button>
          <button onClick={() => navigate({ to: '/invoices' })}>
            Invoices
          </button>
        </>
      )
    }

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: IndexComponent,
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices',
      component: () => {
        return (
          <>
            <h1>Invoices</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute, invoicesRoute]),
      history,
    })

    type Router = typeof router

    render(<RouterProvider router={router} />)

    const postsButton = await screen.findByRole('button', { name: 'Posts' })

    fireEvent.click(postsButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')

    const invoicesButton = await screen.findByRole('button', {
      name: 'Invoices',
    })

    fireEvent.click(invoicesButton)

    expect(
      await screen.findByRole('heading', { name: 'Invoices' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/invoices')
  })

  test('should allow navigation from 404 page when blocker is active', async () => {
    const rootRoute = createRootRoute({
      notFoundComponent: () => {
        const navigate = useNavigate()

        useBlocker({ shouldBlockFn: () => true })

        return (
          <>
            <h1>Not Found</h1>
            <button onClick={() => navigate({ to: '/' })}>Go Home</button>
            <button onClick={() => navigate({ to: '/posts' })}>
              Go to Posts
            </button>
          </>
        )
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
          </>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <>
            <h1>Posts</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    await router.navigate({ to: '/non-existent' as any })

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/non-existent')

    const homeButton = await screen.findByRole('button', { name: 'Go Home' })
    fireEvent.click(homeButton)

    expect(
      await screen.findByRole('heading', { name: 'Index' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/')
  })

  test('should handle blocker navigation from 404 to another 404', async () => {
    const rootRoute = createRootRoute({
      notFoundComponent: () => {
        const navigate = useNavigate()

        useBlocker({ shouldBlockFn: () => true })

        return (
          <>
            <h1>Not Found</h1>
            <button onClick={() => navigate({ to: '/another-404' as any })}>
              Go to Another 404
            </button>
          </>
        )
      },
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history,
    })

    render(<RouterProvider router={router} />)

    await router.navigate({ to: '/non-existent' })

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    const anotherButton = await screen.findByRole('button', {
      name: 'Go to Another 404',
    })
    fireEvent.click(anotherButton)

    expect(
      await screen.findByRole('heading', { name: 'Not Found' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/non-existent')
  })
})
