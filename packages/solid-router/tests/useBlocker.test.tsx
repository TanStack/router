import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'

import { z } from 'zod'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
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
    })

    render(() => <RouterProvider router={router} />)

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
    })

    render(() => <RouterProvider router={router} />)

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
    })

    render(() => <RouterProvider router={router} />)

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
    })

    render(() => <RouterProvider router={router} />)

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
    })

    render(() => <RouterProvider router={router} />)

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
    })

    type Router = typeof router

    render(() => <RouterProvider router={router} />)

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
})
