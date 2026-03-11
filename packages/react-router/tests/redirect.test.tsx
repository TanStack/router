import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import invariant from 'tiny-invariant'
import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
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

  describe('SSR', () => {
    test('when `redirect` is thrown in `beforeLoad`', async () => {
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        path: '/',
        getParentRoute: () => rootRoute,
        beforeLoad: () => {
          throw redirect({
            to: '/about',
          })
        },
      })

      const aboutRoute = createRoute({
        path: '/about',
        getParentRoute: () => rootRoute,
        component: () => {
          return 'About'
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        // Mock server mode
        isServer: true,
        history: createMemoryHistory({
          initialEntries: ['/'],
        }),
      })

      await router.load()

      expect(router.state.redirect).toBeDefined()
      expect(router.state.redirect).toBeInstanceOf(Response)
      invariant(router.state.redirect)

      expect(router.state.redirect.options).toEqual({
        _fromLocation: expect.objectContaining({
          hash: '',
          href: '/',
          pathname: '/',
          search: {},
          searchStr: '',
        }),
        to: '/about',
        href: '/about',
        statusCode: 307,
      })
    })

    test('when `redirect` is thrown in `loader`', async () => {
      const rootRoute = createRootRoute()

      const indexRoute = createRoute({
        path: '/',
        getParentRoute: () => rootRoute,
        loader: () => {
          throw redirect({
            to: '/about',
          })
        },
      })

      const aboutRoute = createRoute({
        path: '/about',
        getParentRoute: () => rootRoute,
        component: () => {
          return 'About'
        },
      })

      const router = createRouter({
        history: createMemoryHistory({
          initialEntries: ['/'],
        }),
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        // Mock server mode
        isServer: true,
      })

      await router.load()

      const currentRedirect = router.state.redirect

      expect(currentRedirect).toBeDefined()
      expect(currentRedirect).toBeInstanceOf(Response)
      invariant(currentRedirect)
      expect(currentRedirect.status).toEqual(307)
      expect(currentRedirect.headers.get('Location')).toEqual('/about')
      expect(currentRedirect.options).toEqual({
        _fromLocation: {
          external: false,
          hash: '',
          href: '/',
          publicHref: '/',
          pathname: '/',
          search: {},
          searchStr: '',
          state: {
            __TSR_index: 0,
            __TSR_key: currentRedirect.options._fromLocation!.state.__TSR_key,
            key: currentRedirect.options._fromLocation!.state.key,
          },
        },
        href: '/about',
        to: '/about',
        statusCode: 307,
      })
    })
  })
})
