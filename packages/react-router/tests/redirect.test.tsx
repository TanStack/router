import * as React from 'react'
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '@tanstack/router-core'

import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useRouter,
} from '../src'

import { sleep } from './utils'
import type { RouterHistory } from '../src'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  vi.clearAllMocks()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

const WAIT_TIME = 100

describe('redirect', () => {
  describe('SPA', () => {
    configure({ reactStrictMode: true })

    test('allows a same-location redirect to settle after a side effect', async () => {
      let firstLoad = true
      const loader = vi.fn(() => {
        if (firstLoad) {
          firstLoad = false
          throw redirect({ to: '/' })
        }
      })
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader,
        component: () => <div>Index page</div>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      expect(await screen.findByText('Index page')).toBeInTheDocument()
      expect(window.location.pathname).toBe('/')
      expect(loader).toHaveBeenCalledTimes(2)
      expect(router.state.status).toBe('idle')
    })

    test('renders a root error after too many same-location redirects', async () => {
      const loader = vi.fn(() => {
        throw redirect({ to: '/' })
      })
      const rootRoute = createRootRoute({
        errorComponent: ({ error }) => (
          <div data-testid="root-error">Root: {error.message}</div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader,
        errorComponent: ({ error }) => (
          <div data-testid="index-error">Index: {error.message}</div>
        ),
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('root-error')).toHaveTextContent(
        'Root: Too many redirects',
      )
      expect(screen.queryByTestId('index-error')).not.toBeInTheDocument()
      expect(window.location.pathname).toBe('/')
      expect(loader).toHaveBeenCalledTimes(21)
      expect(router.state.status).toBe('idle')
    })

    test('renders a root error after too many alternating redirects', async () => {
      const indexLoader = vi.fn(() => {
        throw redirect({ to: '/other' })
      })
      const otherLoader = vi.fn(() => {
        throw redirect({ to: '/' })
      })
      const rootRoute = createRootRoute({
        errorComponent: ({ error }) => (
          <div data-testid="root-error">Root: {error.message}</div>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader: indexLoader,
        errorComponent: ({ error }) => (
          <div data-testid="index-error">Index: {error.message}</div>
        ),
      })
      const otherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
        loader: otherLoader,
        errorComponent: ({ error }) => (
          <div data-testid="other-error">Other: {error.message}</div>
        ),
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, otherRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      expect(await screen.findByTestId('root-error')).toHaveTextContent(
        'Root: Too many redirects',
      )
      expect(screen.queryByTestId('index-error')).not.toBeInTheDocument()
      expect(screen.queryByTestId('other-error')).not.toBeInTheDocument()
      expect(window.location.pathname).toBe('/')
      expect(indexLoader).toHaveBeenCalledTimes(11)
      expect(otherLoader).toHaveBeenCalledTimes(10)
      expect(router.state.status).toBe('idle')
    })

    test('when `redirect` is thrown in `beforeLoad`', async () => {
      const nestedLoaderMock = vi.fn()
      const nestedFooLoaderMock = vi.fn()

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return (
            <div>
              <h1>Index page</h1>
              <Link to="/about">link to about</Link>
            </div>
          )
        },
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        beforeLoad: async () => {
          await sleep(WAIT_TIME)
          throw redirect({ to: '/nested/foo' })
        },
      })
      const nestedRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/nested',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedLoaderMock('nested')
        },
      })
      const fooRoute = createRoute({
        getParentRoute: () => nestedRoute,
        path: '/foo',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedFooLoaderMock('foo')
        },
        component: () => <div>Nested Foo page</div>,
      })
      const routeTree = rootRoute.addChildren([
        nestedRoute.addChildren([fooRoute]),
        aboutRoute,
        indexRoute,
      ])
      const router = createRouter({ routeTree, history })

      render(<RouterProvider router={router} />)

      const linkToAbout = await screen.findByText('link to about')

      expect(linkToAbout).toBeInTheDocument()

      fireEvent.click(linkToAbout)

      const fooElement = await screen.findByText('Nested Foo page')

      expect(fooElement).toBeInTheDocument()

      expect(router.state.location.href).toBe('/nested/foo')
      expect(window.location.pathname).toBe('/nested/foo')

      expect(nestedLoaderMock).toHaveBeenCalled()
      expect(nestedFooLoaderMock).toHaveBeenCalled()
    })

    test('when root `beforeLoad` redirects while root pendingComponent is showing and the target route is lazy', async () => {
      let hasRedirected = false
      const beforeLoad = createControlledPromise<void>()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const rootRoute = createRootRoute({
        component: () => <Outlet />,
        pendingMs: 0,
        pendingComponent: () => <div data-testid="pending">loading</div>,
        beforeLoad: async () => {
          await beforeLoad
          if (!hasRedirected) {
            hasRedirected = true
            throw redirect({ to: '/posts' })
          }
        },
      })

      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <div data-testid="index-page">Index page</div>,
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
      }).lazy(() => import('./lazy/normal').then((d) => d.Route('/posts')))

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      try {
        expect(await screen.findByTestId('pending')).toBeInTheDocument()
      } finally {
        await act(() => {
          beforeLoad.resolve()
        })
      }

      // The lazy target route adds the async boundary that exposes the stale
      // redirected-match render path this regression is guarding.
      expect(await screen.findByTestId('lazy-route-page')).toBeInTheDocument()
      expect(screen.queryByTestId('pending')).not.toBeInTheDocument()
      expect(router.state.location.href).toBe('/posts')
      expect(router.state.status).toBe('idle')
      expect(consoleError).not.toHaveBeenCalled()
    })

    test('when `redirect` is thrown in `loader`', async () => {
      const nestedLoaderMock = vi.fn()
      const nestedFooLoaderMock = vi.fn()

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return (
            <div>
              <h1>Index page</h1>
              <Link to="/about">link to about</Link>
            </div>
          )
        },
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        loader: async () => {
          await sleep(WAIT_TIME)
          throw redirect({
            to: '/nested/foo',
            hash: 'some-hash',
            search: { someSearch: 'hello123' },
          })
        },
      })
      const nestedRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/nested',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedLoaderMock('nested')
        },
      })
      const fooRoute = createRoute({
        validateSearch: (search) => {
          return {
            someSearch: search.someSearch as string,
          }
        },
        getParentRoute: () => nestedRoute,
        path: '/foo',
        loader: async () => {
          await sleep(WAIT_TIME)
          nestedFooLoaderMock('foo')
        },
        component: () => <div>Nested Foo page</div>,
      })
      const routeTree = rootRoute.addChildren([
        nestedRoute.addChildren([fooRoute]),
        aboutRoute,
        indexRoute,
      ])
      const router = createRouter({ routeTree, history })

      render(<RouterProvider router={router} />)

      const linkToAbout = await screen.findByText('link to about')

      expect(linkToAbout).toBeInTheDocument()

      fireEvent.click(linkToAbout)

      const fooElement = await screen.findByText('Nested Foo page')

      expect(fooElement).toBeInTheDocument()

      expect(router.state.location.href).toBe(
        '/nested/foo?someSearch=hello123#some-hash',
      )
      expect(window.location.pathname).toBe('/nested/foo')

      expect(nestedLoaderMock).toHaveBeenCalled()
      expect(nestedFooLoaderMock).toHaveBeenCalled()
    })

    test('when `redirect` is thrown in `loader` after `router.invalidate()`', async () => {
      let shouldRedirect = false

      const rootRoute = createRootRoute({})
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return (
            <div>
              <h1>Index page</h1>
              <Link data-testid="link-to-about" to="/about">
                link to about
              </Link>
            </div>
          )
        },
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        loader: async () => {
          await sleep(WAIT_TIME)
          if (shouldRedirect) {
            throw redirect({
              to: '/final',
            })
          }
        },
        component: function Component() {
          const router = useRouter()
          return (
            <button
              data-testid="button-invalidate"
              onClick={() => {
                shouldRedirect = true
                router.invalidate()
              }}
            >
              invalidate
            </button>
          )
        },
      })
      const finalRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/final',
        component: () => <div>Final</div>,
      })

      const routeTree = rootRoute.addChildren([
        aboutRoute,
        indexRoute,
        finalRoute,
      ])
      const router = createRouter({ routeTree, history })

      render(<RouterProvider router={router} />)

      const linkToAbout = await screen.findByTestId('link-to-about')
      expect(linkToAbout).toBeInTheDocument()

      fireEvent.click(linkToAbout)

      const invalidateButton = await screen.findByTestId('button-invalidate')
      expect(invalidateButton).toBeInTheDocument()

      fireEvent.click(invalidateButton)

      expect(await screen.findByText('Final')).toBeInTheDocument()
      expect(window.location.pathname).toBe('/final')
    })
  })
})
