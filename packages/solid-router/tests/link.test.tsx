import * as Solid from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'

import { z } from 'zod'
import {
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouteMask,
  createRouter,
  redirect,
  retainSearchParams,
  stripSearchParams,
  useLoaderData,
  useMatchRoute,
  useParams,
  useRouteContext,
  useSearch,
} from '../src'
import {
  getIntersectionObserverMock,
  getSearchParamsFromURI,
  sleep,
} from './utils'

const ioObserveMock = vi.fn()
const ioDisconnectMock = vi.fn()

beforeEach(() => {
  const io = getIntersectionObserverMock({
    observe: ioObserveMock,
    disconnect: ioDisconnectMock,
  })
  vi.stubGlobal('IntersectionObserver', io)
  window.history.replaceState(null, 'root', '/')
})

afterEach(() => {
  vi.resetAllMocks()
  cleanup()
})

const WAIT_TIME = 300

describe('Link', () => {

  // rerender doesn't exist in solid

  // test('when using renderHook it returns a hook with same content to prove rerender works', async () => {
  //   /**
  //    * This is the hook that will be testet.
  //    *
  //    * @returns custom state
  //    */
  //   const useLocationFromState = () => {
  //     const { location } = useRouterState()

  //     // could return anything just to prove it will work.
  //     const memoLocation = Solid.useMemo(() => {
  //       return {
  //         href: location.href,
  //         pathname: location.pathname,
  //       }
  //     }, [location.href, location.pathname])

  //     return memoLocation
  //   }

  //   const IndexComponent = ({ children }: { children: Solid.JSXElement }) => {
  //     return <h1 data-testid="testId">{children}</h1>
  //   }
  //   const RouterContainer = ({ children }: { children: Solid.JSXElement }) => {
  //     const childrenRef = Solid.useRef(children)
  //     const memoedRouteTree = Solid.useMemo(() => {
  //       const rootRoute = createRootRoute()
  //       const indexRoute = createRoute({
  //         getParentRoute: () => rootRoute,
  //         path: '/',
  //         component: () => (
  //           <IndexComponent>{childrenRef.current}</IndexComponent>
  //         ),
  //       })
  //       return rootRoute.addChildren([indexRoute])
  //     }, [])

  //     const memoedRouter = Solid.useMemo(() => {
  //       const router = createRouter({
  //         routeTree: memoedRouteTree,
  //       })

  //       return router
  //     }, [memoedRouteTree])
  //     return <RouterProvider router={memoedRouter} />
  //   }

  //   const { result, rerender } = renderHook(
  //     () => {
  //       return useLocationFromState()
  //     },
  //     { wrapper: RouterContainer },
  //   )
  //   await waitFor(() => expect(screen.getByTestId('testId')).toBeVisible())
  //   expect(result.current).toBeTruthy()

  //   const original = result.current

  //   rerender()

  //   await waitFor(() => expect(screen.getByTestId('testId')).toBeVisible())
  //   const updated = result.current

  //   expect(original).toBe(updated)
  // })

  test('when a Link is disabled', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>Index</h1>
          <Link to="/posts" disabled>
            Posts
          </Link>
        </>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => <h1>Posts</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(window.location.pathname).toBe('/')

    expect(postsLink).not.toBeDisabled()
    expect(postsLink).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(postsLink)

    await expect(
      screen.findByRole('header', { name: 'Posts' }),
    ).rejects.toThrow()
  })

  test('when the current route is the root', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/" activeProps={{ class: 'active' }}>
              Index
            </Link>
            <Link to="/posts" inactiveProps={{ class: 'inactive' }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return <h1>Posts</h1>
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const indexLink = await screen.findByRole('link', { name: 'Index' })

    expect(window.location.pathname).toBe('/')

    expect(indexLink).toHaveAttribute('aria-current', 'page')
    expect(indexLink).toHaveClass('active')
    expect(indexLink).toHaveAttribute('data-status', 'active')
    expect(indexLink).toHaveAttribute('href', '/')

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveClass('inactive')
    expect(postsLink).toHaveAttribute('href', '/posts')
    expect(postsLink).not.toHaveAttribute('aria-current', 'page')
    expect(postsLink).not.toHaveAttribute('data-status', 'active')
  })

  describe('when the current route has a search fields with undefined values', () => {
    async function runTest(opts: { explicitUndefined: boolean | undefined }) {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return (
            <>
              <h1>Index</h1>
              <Link
                to="/"
                activeOptions={{ exact: true }}
                inactiveProps={{ class: 'inactive' }}
              >
                Index exact
              </Link>
              <Link
                to="/"
                search={{ foo: undefined }}
                inactiveProps={{ class: 'inactive' }}
                activeOptions={{ explicitUndefined: opts.explicitUndefined }}
              >
                Index foo=undefined
              </Link>
              <Link
                to="/"
                search={{ foo: undefined }}
                activeOptions={{
                  exact: true,
                  explicitUndefined: opts.explicitUndefined,
                }}
                inactiveProps={{ class: 'inactive' }}
              >
                Index foo=undefined-exact
              </Link>
              <Link
                to="/"
                search={{ foo: 'bar' }}
                inactiveProps={{
                  class: 'inactive',
                }}
              >
                Index foo=bar
              </Link>
            </>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
      })

      render(() => <RouterProvider router={router} />)

      // round 1
      const indexExactLink = await screen.findByRole('link', {
        name: 'Index exact',
      })

      const indexFooUndefinedLink = await screen.findByRole('link', {
        name: 'Index foo=undefined',
      })

      const indexFooUndefinedExactLink = await screen.findByRole('link', {
        name: 'Index foo=undefined-exact',
      })

      const indexFooBarLink = await screen.findByRole('link', {
        name: 'Index foo=bar',
      })

      expect(window.location.pathname).toBe('/')

      expect(indexExactLink).toHaveClass('active')
      expect(indexExactLink).not.toHaveClass('inactive')
      expect(indexExactLink).toHaveAttribute('href', '/')
      expect(indexExactLink).toHaveAttribute('aria-current', 'page')
      expect(indexExactLink).toHaveAttribute('data-status', 'active')

      if (opts.explicitUndefined) {
        expect(indexFooUndefinedLink).toHaveClass('active')
        expect(indexFooUndefinedLink).not.toHaveClass('inactive')
        expect(indexFooUndefinedLink).toHaveAttribute('aria-current', 'page')
        expect(indexFooUndefinedLink).toHaveAttribute('data-status', 'active')
      } else {
        expect(indexFooUndefinedLink).toHaveClass('active')
        expect(indexFooUndefinedLink).not.toHaveClass('inactive')
        expect(indexFooUndefinedLink).toHaveAttribute('aria-current', 'page')
        expect(indexFooUndefinedLink).toHaveAttribute('data-status', 'active')
      }

      expect(indexFooUndefinedLink).toHaveAttribute('href', '/')

      if (opts.explicitUndefined) {
        expect(indexFooUndefinedExactLink).not.toHaveClass('active')
        expect(indexFooUndefinedExactLink).toHaveClass('inactive')
        expect(indexFooUndefinedExactLink).not.toHaveAttribute(
          'aria-current',
          'page',
        )
        expect(indexFooUndefinedExactLink).not.toHaveAttribute(
          'data-status',
          'active',
        )
      } else {
        expect(indexFooUndefinedExactLink).toHaveClass('active')
        expect(indexFooUndefinedExactLink).not.toHaveClass('inactive')
        expect(indexFooUndefinedExactLink).toHaveAttribute(
          'aria-current',
          'page',
        )
        expect(indexFooUndefinedExactLink).toHaveAttribute(
          'data-status',
          'active',
        )
      }

      expect(indexFooUndefinedExactLink).toHaveAttribute('href', '/')

      expect(indexFooBarLink).toHaveClass('inactive')
      expect(indexFooBarLink).not.toHaveClass('active')
      expect(indexFooBarLink).toHaveAttribute('href', '/?foo=bar')
      expect(indexFooBarLink).not.toHaveAttribute('aria-current', 'page')
      expect(indexFooBarLink).not.toHaveAttribute('data-status', 'active')

      // navigate to /?foo=bar
      fireEvent.click(indexFooBarLink)

      expect(indexExactLink).toHaveClass('inactive')
      expect(indexExactLink).not.toHaveClass('active')
      expect(indexExactLink).toHaveAttribute('href', '/')
      expect(indexExactLink).not.toHaveAttribute('aria-current', 'page')
      expect(indexExactLink).not.toHaveAttribute('data-status', 'active')

      if (opts.explicitUndefined) {
        expect(indexFooUndefinedLink).not.toHaveClass('active')
        expect(indexFooUndefinedLink).toHaveClass('inactive')
        expect(indexFooUndefinedLink).not.toHaveAttribute(
          'aria-current',
          'page',
        )
        expect(indexFooUndefinedLink).not.toHaveAttribute(
          'data-status',
          'active',
        )
      } else {
        expect(indexFooUndefinedLink).toHaveClass('active')
        expect(indexFooUndefinedLink).not.toHaveClass('inactive')
        expect(indexFooUndefinedLink).toHaveAttribute('aria-current', 'page')
        expect(indexFooUndefinedLink).toHaveAttribute('data-status', 'active')
      }

      expect(indexFooUndefinedLink).toHaveAttribute('href', '/')

      expect(indexFooUndefinedExactLink).toHaveClass('inactive')
      expect(indexFooUndefinedExactLink).not.toHaveClass('active')
      expect(indexFooUndefinedExactLink).toHaveAttribute('href', '/')
      expect(indexFooUndefinedExactLink).not.toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(indexFooUndefinedExactLink).not.toHaveAttribute(
        'data-status',
        'active',
      )

      expect(indexFooBarLink).toHaveClass('active')
      expect(indexFooBarLink).not.toHaveClass('inactive')
      expect(indexFooBarLink).toHaveAttribute('href', '/?foo=bar')
      expect(indexFooBarLink).toHaveAttribute('aria-current', 'page')
      expect(indexFooBarLink).toHaveAttribute('data-status', 'active')
    }

    test.each([undefined, false])(
      'activeOptions.explicitUndefined=%s',
      async (explicitUndefined) => {
        await runTest({ explicitUndefined })
      },
    )

    test('activeOptions.explicitUndefined=true', async () => {
      await runTest({ explicitUndefined: true })
    })
  })

  test('when the current route is the root with beforeLoad that throws', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute({
      onError,
      beforeLoad: () => {
        throw new Error('Something went wrong!')
      },
      errorComponent: () => <span>Oops! Something went wrong!</span>,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/" activeProps={{ class: 'active' }}>
              Index
            </Link>
            <Link to="/posts" inactiveProps={{ class: 'inactive' }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return <h1>Posts</h1>
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const errorText = await screen.findByText('Oops! Something went wrong!')
    expect(errorText).toBeInTheDocument()
    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/">Index</Link>
            <Link to="/posts">Posts</Link>
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
            <Link to="/">Index</Link>
            <Link to="/posts" activeProps={{ class: 'active' }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')

    const indexLink = await screen.findByRole('link', { name: 'Index' })

    expect(window.location.pathname).toBe('/posts')
    expect(indexLink).not.toHaveAttribute('aria-current', 'page')
    expect(indexLink).not.toHaveAttribute('data-status', 'active')
    expect(indexLink).toHaveAttribute('href', '/')

    expect(postsLink).toHaveAttribute('data-status', 'active')
    expect(postsLink).toHaveAttribute('aria-current', 'page')
    expect(postsLink).toHaveClass('active')
    expect(postsLink).toHaveAttribute('href', '/posts')
  })

  test('when navigating to /posts with a base url', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/">Index</Link>
            <Link to="/posts">Posts</Link>
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
            <Link to="/">Index</Link>
            <Link to="/posts" activeProps={{ class: 'active' }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      basepath: '/app',
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeInTheDocument()

    const indexLink = await screen.findByRole('link', { name: 'Index' })

    expect(window.location.pathname).toBe('/app/posts')
    expect(indexLink).not.toHaveAttribute('aria-current', 'page')
    expect(indexLink).not.toHaveAttribute('data-status', 'active')
    expect(indexLink).toHaveAttribute('href', '/app/')

    expect(postsLink).toHaveAttribute('data-status', 'active')
    expect(postsLink).toHaveAttribute('aria-current', 'page')
    expect(postsLink).toHaveClass('active')
    expect(postsLink).toHaveAttribute('href', '/app/posts')
  })

  test('when navigating to /posts with search', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 0 }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      const search = useSearch({ strict: false })
      return (
        <>
          <h1>Posts</h1>
          <span>Page: {search.page}</span>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        return {
          page: input.page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=0')

    fireEvent.click(postsLink)

    const postsHeading = await screen.findByRole('heading', { name: 'Posts' })
    expect(postsHeading).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
    expect(window.location.search).toBe('?page=0')

    const pageZero = await screen.findByText('Page: 0')
    expect(pageZero).toBeInTheDocument()
  })

  test('when navigating to /posts with invalid search', async () => {
    const rootRoute = createRootRoute()
    const onError = vi.fn()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 'invalid' }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      const search = useSearch({ strict: false })
      return (
        <>
          <h1>Posts</h1>
          <span>Page: {search.page}</span>
        </>
      )
    }

    const ErrorComponent = () => {
      return <h1>Oops, something went wrong</h1>
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      errorComponent: ErrorComponent,
      onError,
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=invalid')

    fireEvent.click(postsLink)

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())

    const errorHeading = await screen.findByRole('heading', {
      name: 'Oops, something went wrong',
    })
    expect(errorHeading).toBeInTheDocument()
  })

  test('when navigating to /posts with a loader', async () => {
    const loader = vi.fn((opts) => {
      return Promise.resolve({ pageDoubled: opts.deps.page.page * 2 })
    })
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      const data = useLoaderData({ strict: false })
      return (
        <>
          <h1>Posts</h1>
          <span>Page: {data.pageDoubled}</span>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: loader,
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=2')

    fireEvent.click(postsLink)

    const pageFour = await screen.findByText('Page: 4')
    expect(pageFour).toBeInTheDocument()

    expect(loader).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a loader that errors', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      const loader = useLoaderData({ strict: false })
      return (
        <>
          <h1>Posts</h1>
          <span>Page: {loader.pageDoubled}</span>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)

        if (isNaN(page)) throw Error('Not a number!')

        return {
          page,
        }
      },
      loaderDeps: (opts) => ({ page: opts.search }),
      onError,
      errorComponent: () => <span>Something went wrong!</span>,
      loader: () => {
        throw new Error()
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=2')

    fireEvent.click(postsLink)

    const errorText = await screen.findByText('Something went wrong!')
    expect(errorText).toBeInTheDocument()

    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating away from a route with a loader that errors', async () => {
    const postsOnError = vi.fn()
    const indexOnError = vi.fn()
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <div>
            <Link to="/">Index</Link> <Link to="/posts">Posts</Link>
          </div>
          <hr />
          <Outlet />
        </>
      ),
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
      onError: indexOnError,
      errorComponent: () => <span>IndexError</span>,
    })

    const error = new Error('Something went wrong!')

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: () => {
        throw error
      },
      onError: postsOnError,
      errorComponent: () => <span>PostsError</span>,
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

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const postsErrorText = await screen.findByText('PostsError')
    expect(postsErrorText).toBeInTheDocument()

    expect(postsOnError).toHaveBeenCalledOnce()
    expect(postsOnError).toHaveBeenCalledWith(error)

    const indexLink = await screen.findByRole('link', { name: 'Index' })
    fireEvent.click(indexLink)

    expect(screen.findByText('IndexError')).rejects.toThrow()
    expect(indexOnError).not.toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a beforeLoad that redirects', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return <h1>Posts</h1>
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw redirect({
          to: '/login',
        })
      },
      component: PostsComponent,
    })

    const authRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: () => <h1>Auth!</h1>,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute, authRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const authText = await screen.findByText('Auth!')
    expect(authText).toBeInTheDocument()
  })

  test('when navigating to /posts with a beforeLoad that returns context', async () => {
    const rootRoute = createRootRouteWithContext<{
      userId: string
    }>()()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      const context = useRouteContext({ strict: false })
      return (
        <>
          <h1>Posts</h1>
          <span>UserId: {context.userId}</span>
          <span>Username: {context.username}</span>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        return Promise.resolve({
          username: 'username',
        })
      },
      component: PostsComponent,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const userId = await screen.findByText('UserId: userId')
    expect(userId).toBeInTheDocument()
  })

  test('when navigating to /posts with a beforeLoad that throws an error', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return <h1>Posts</h1>
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
      onError,
      errorComponent: () => <span>Oops! Something went wrong!</span>,
      component: PostsComponent,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const errorText = await screen.findByText('Oops! Something went wrong!')
    expect(errorText).toBeInTheDocument()

    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a beforeLoad that throws an error bubbles to the root', async () => {
    const rootRoute = createRootRoute({
      errorComponent: () => <span>Oops! Something went wrong!</span>,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return <h1>Posts</h1>
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
      component: PostsComponent,
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    const errorText = await screen.findByText('Oops! Something went wrong!')
    expect(errorText).toBeInTheDocument()
  })

  test('when navigating to /posts with a beforeLoad that throws an error bubbles to the nearest parent', async () => {
    const rootRoute = createRootRoute({
      errorComponent: () => <span>Root error</span>,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              Post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      errorComponent: () => <span>Oops! Something went wrong!</span>,
      component: PostsComponent,
    })

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      beforeLoad: () => {
        throw new Error('Oops. Something went wrong!')
      },
    })

    const router = createRouter({
      context: { userId: 'userId' },
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', { name: 'Post' })

    fireEvent.click(postLink)

    const errorText = await screen.findByText('Oops! Something went wrong!')
    expect(errorText).toBeInTheDocument()
  })

  test('when navigating to the root with an error in component', async () => {
    const notFoundComponent = vi.fn()

    const rootRoute = createRootRoute({
      errorComponent: () => <span>Expected rendering error message</span>,
      notFoundComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        throw new Error(
          'Error from component should not render notFoundComponent',
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const errorText = await screen.findByText(
      'Expected rendering error message',
    )
    expect(errorText).toBeInTheDocument()
    expect(notFoundComponent).not.toBeCalled()
  })

  test('when navigating to /posts with params', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Link to="/">Index</Link>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return <span>Params: {params.postId}</span>
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeInTheDocument()
  })

  test('when navigating from /posts to ./$postId', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostsIndexComponent = () => {
      return (
        <>
          <h1>Posts Index</h1>
          <Link from="/posts/" to="./$postId" params={{ postId: 'id1' }}>
            To the first post
          </Link>
        </>
      )
    }

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: PostsIndexComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Link to="/">Index</Link>
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsIndexRoute, postRoute]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts')

    fireEvent.click(postsLink)

    const postsText = await screen.findByText('Posts Index')
    expect(postsText).toBeInTheDocument()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts/id1')
  })

  test('when navigating from /posts to ../posts/$postId', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostsIndexComponent = () => {
      return (
        <>
          <h1>Posts Index</h1>
          <Link from="/posts/" to="../posts/$postId" params={{ postId: 'id1' }}>
            To the first post
          </Link>
        </>
      )
    }

    const postsIndexRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '/',
      component: PostsIndexComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Link to="/">Index</Link>
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsIndexRoute, postRoute]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts')

    fireEvent.click(postsLink)

    const postsIndexText = await screen.findByText('Posts Index')
    expect(postsIndexText).toBeInTheDocument()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const paramText = await screen.findByText('Params: id1')
    expect(paramText).toBeInTheDocument()
  })

  test('when navigating from /posts/$postId to /posts/$postId/info and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="/posts/$postId/info">
            To Information
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    const informationText = await screen.findByText('Information')
    expect(informationText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    const paramsText2 = await screen.findByText('Params: id1')
    expect(paramsText2).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId with a trailing slash to /posts/$postId/info and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId/',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="/posts/$postId/info">
            To Information
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    const informationText = await screen.findByText('Information')
    expect(informationText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    const paramsText2 = await screen.findByText('Params: id1')
    expect(paramsText2).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId to ./info and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="./info">
            To Information
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    const informationText = await screen.findByText('Information')
    expect(informationText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    const paramsText2 = await screen.findByText('Params: id1')
    expect(paramsText2).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId to / and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="/">
            To Root
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([postRoute.addChildren([detailsRoute])]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const rootLink = await screen.findByRole('link', {
      name: 'To Root',
    })

    expect(rootLink).toHaveAttribute('href', '/')

    fireEvent.click(rootLink)

    const indexText = await screen.findByText('Index')
    expect(indexText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/')

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId with search and to ./info with search and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link
              to="/posts/$postId/details"
              params={{ postId: 'id1' }}
              search={{ page: 2 }}
            >
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
      validateSearch: () => ({ page: 2 }),
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link
            from="/posts/$postId"
            to="./info"
            search={(prev: any): any => ({ ...prev, more: true })}
          >
            To Information
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
      validateSearch: () => ({ more: false }),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details?page=2')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute(
      'href',
      '/posts/id1/info?page=2&more=true',
    )

    fireEvent.click(informationLink)

    const informationText = await screen.findByText('Information')
    expect(informationText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    const paramsText2 = await screen.findByText('Params: id1')
    expect(paramsText2).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId to ../$postId and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="../$postId">
            To Post
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const postLink = await screen.findByRole('link', {
      name: 'To Post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const postsText = await screen.findByText('Posts')
    expect(postsText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1')

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts/$postId with an index to ../$postId and the current route is /posts/$postId/details', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const postIndexRoute = createRoute({
      getParentRoute: () => postRoute,
      path: '/',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link from="/posts/$postId" to="../$postId">
            To Post
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          postsRoute.addChildren([
            postRoute.addChildren([
              postIndexRoute,
              detailsRoute,
              informationRoute,
            ]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const paramsText1 = await screen.findByText('Params: id1')
    expect(paramsText1).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const postLink = await screen.findByRole('link', {
      name: 'To Post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const postsText = await screen.findByText('Posts')
    expect(postsText).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1')

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /invoices to ./invoiceId and the current route is /posts/$postId/details', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: '_layout',
      component: () => {
        return (
          <>
            <h1>Layout</h1>
            <Outlet />
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const DetailsComponent = () => {
      return (
        <>
          <h1>Details!</h1>
          <Link
            from="/invoices"
            to="./$invoiceId"
            params={{ invoiceId: 'id1' }}
          >
            To Invoices
          </Link>
        </>
      )
    }

    const detailsRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'details',
      component: DetailsComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      component: () => (
        <>
          <h1>Invoices!</h1>
          <Outlet />
        </>
      ),
    })

    const InvoiceComponent = () => {
      const params = useParams({ strict: false })
      return <span>invoiceId: {params.invoiceId}</span>
    }

    const invoiceRoute = createRoute({
      getParentRoute: () => invoicesRoute,
      path: '$invoiceId',
      component: InvoiceComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        layoutRoute.addChildren([
          invoicesRoute.addChildren([invoiceRoute]),
          postsRoute.addChildren([
            postRoute.addChildren([detailsRoute, informationRoute]),
          ]),
        ]),
      ]),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    const invoicesErrorText = await screen.findByText(
      'Invariant failed: Could not find match for from: /invoices',
    )
    expect(invoicesErrorText).toBeInTheDocument()
  })

  test('when navigating to /posts/$postId/info which is declaratively masked as /posts/$postId', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId/info" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      postsRoute.addChildren([postRoute.addChildren([informationRoute])]),
    ])

    const routeMask = createRouteMask({
      routeTree,
      from: '/posts/$postId/info',
      to: '/posts/$postId',
    })

    const router = createRouter({
      routeTree,
      routeMasks: [routeMask],
    })

    render(() => <RouterProvider router={router} />)

    const informationLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1')

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating to /posts/$postId/info which is imperatively masked as /posts/$postId', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link
              to="/posts/$postId/info"
              params={{ postId: 'id1' }}
              mask={{ to: '/posts/$postId', params: { postId: 'id1' } }}
            >
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const InformationComponent = () => {
      return <h1>Information</h1>
    }

    const informationRoute = createRoute({
      getParentRoute: () => postRoute,
      path: 'info',
      component: InformationComponent,
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      postsRoute.addChildren([postRoute.addChildren([informationRoute])]),
    ])

    const router = createRouter({
      routeTree,
    })

    render(() => <RouterProvider router={router} />)

    const informationLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1')

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when preloading /post/$postId with a redirects to /login', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const loaderFn = vi.fn()

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const search = vi.fn((prev) => ({ page: prev.postPage }))

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
      validateSearch: () => ({ postPage: 0 }),
      loader: () => {
        loaderFn()
        throw redirect({
          to: '/login',
          search,
        })
      },
    })

    const LoginComponent = () => {
      const [status, setStatus] = Solid.createSignal<'idle' | 'success' | 'error'>(
        'idle',
      )

      Solid.onMount(() => {
        const onLoad = async () => {
          try {
            await router.preloadRoute({
              to: '/posts/$postId',
              params: { postId: 'id1' },
              search: { postPage: 0 },
            })
            setStatus('success')
          } catch (e) {
            setStatus('error')
          }
        }
        onLoad()
      })

      return <>{status() === 'success' ? 'Login!' : 'Waiting...'}</>
    }

    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: LoginComponent,
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      loginRoute,
      postsRoute.addChildren([postRoute]),
    ])

    const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(loaderFn).toHaveBeenCalled())

    await waitFor(() => expect(search).toHaveBeenCalledWith({ postPage: 0 }))

    fireEvent.click(postLink)

    const loginText = await screen.findByText('Login!')
    expect(loginText).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating to /post/$postId with a redirect from /post/$postId to ../../login in a loader', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const search = vi.fn((prev) => ({ page: prev.postPage }))

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
      validateSearch: () => ({ postPage: 0 }),
      loader: () => {
        throw redirect({
          from: postRoute.fullPath,
          to: '../../login',
          search,
        })
      },
    })

    const LoginComponent = () => {
      return <>Login!</>
    }

    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: LoginComponent,
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      loginRoute,
      postsRoute.addChildren([postRoute]),
    ])

    const router = createRouter({
      routeTree,
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const loginText = await screen.findByText('Login!')
    expect(loginText).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating to /post/$postId with a redirect from /post/$postId to ../../login in beforeLoad', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const search = vi.fn((prev) => ({ page: prev.postPage }))

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
      validateSearch: () => ({ postPage: 0 }),
      beforeLoad: () => {
        throw redirect({
          from: postRoute.fullPath,
          to: '../../login',
          search,
        })
      },
    })

    const LoginComponent = () => {
      return <>Login!</>
    }

    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: LoginComponent,
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      loginRoute,
      postsRoute.addChildren([postRoute]),
    ])

    const router = createRouter({
      routeTree,
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    const loginText = await screen.findByText('Login!')
    expect(loginText).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when preloading /post/$postId with a beforeLoad that navigates to /login', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const search = vi.fn((prev) => ({ page: prev.postPage }))

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
      validateSearch: () => ({ postPage: 0 }),
      beforeLoad: (context) => context.navigate({ to: '/login', search }),
    })

    const LoginComponent = () => {
      return <>Login!</>
    }

    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: LoginComponent,
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      loginRoute,
      postsRoute.addChildren([postRoute]),
    ])

    const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(search).toHaveBeenCalledWith({ postPage: 0 }))

    fireEvent.click(postLink)

    const loginText = await screen.findByText('Login!')
    expect(loginText).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when preloading /post/$postId with a loader that navigates to /login', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
          <Outlet />
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return (
        <>
          <span>Params: {params.postId}</span>
          <Outlet />
        </>
      )
    }

    const search = vi.fn((prev) => ({ page: prev.postPage }))

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
      validateSearch: () => ({ postPage: 0 }),
      loader: (context) => {
        context.navigate({ to: '/login', search })
      },
    })

    const LoginComponent = () => {
      return <>Login!</>
    }

    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'login',
      component: LoginComponent,
      validateSearch: () => ({ page: 0 }),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      loginRoute,
      postsRoute.addChildren([postRoute]),
    ])

    const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
    })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(search).toHaveBeenCalledWith({ postPage: 0 }))

    fireEvent.click(postLink)

    const loginText = await screen.findByText('Login!')
    expect(loginText).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts to /invoices with conditionally rendering Link on the root', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)
    const RootComponent = () => {
      const matchRoute = useMatchRoute()
      const matchPosts = Boolean(matchRoute({ to: '/posts' }))
      const matchInvoices = Boolean(matchRoute({ to: '/invoices' }))

      return (
        <>
          {matchPosts && (
            <Link from="/posts" to="/posts">
              From posts
            </Link>
          )}
          {matchInvoices && (
            <Link from="/invoices" to="/invoices">
              From invoices
            </Link>
          )}
          <Outlet />
        </>
      )
    }

    const rootRoute = createRootRoute({
      component: RootComponent,
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>Index Route</h1>
          <Link to="/posts">Go to posts</Link>
        </>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => (
        <>
          <h1>On Posts</h1>
          <Link to="/invoices">To invoices</Link>
        </>
      ),
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      component: () => (
        <>
          <h1>On Invoices</h1>
          <Link to="/posts">To posts</Link>
        </>
      ),
    })

    const routeTree = rootRoute.addChildren([
      indexRoute,
      postsRoute,
      invoicesRoute,
    ])

    const router = createRouter({
      routeTree,
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Go to posts' })

    fireEvent.click(postsLink)

    const fromPostsLink = await screen.findByRole('link', {
      name: 'From posts',
    })

    expect(fromPostsLink).toBeInTheDocument()

    const toInvoicesLink = await screen.findByRole('link', {
      name: 'To invoices',
    })

    fireEvent.click(toInvoicesLink)

    const fromInvoicesLink = await screen.findByRole('link', {
      name: 'From invoices',
    })

    expect(fromInvoicesLink).toBeInTheDocument()

    expect(fromPostsLink).not.toBeInTheDocument()

    const toPostsLink = await screen.findByRole('link', {
      name: 'To posts',
    })

    fireEvent.click(toPostsLink)

    const onPostsText = await screen.findByText('On Posts')
    expect(onPostsText).toBeInTheDocument()

    expect(fromInvoicesLink).not.toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when linking to self with from prop set and param containing a slash', async () => {
    const ErrorComponent = vi.fn(() => <h1>Something went wrong!</h1>)

    const rootRoute = createRootRoute({
      errorComponent: ErrorComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Link to="/$postId" params={{ postId: 'id/with-slash' }}>
          Go to post
        </Link>
      ),
    })

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/$postId',
      component: () => (
        <Link from="/$postId" to="/$postId">
          Link to self with from prop set
        </Link>
      ),
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(postLink).toHaveAttribute('href', '/id%2Fwith-slash')

    fireEvent.click(postLink)

    const selfLink = await screen.findByRole('link', {
      name: 'Link to self with from prop set',
    })

    expect(selfLink).toBeInTheDocument()
    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating to /$postId with parseParams and stringifyParams', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Link to="/$postId" params={{ postId: 2 }}>
          Go to post
        </Link>
      ),
    })

    const parseParams = vi.fn()
    const stringifyParams = vi.fn()

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return <div>Post: {params.postId}</div>
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      parseParams: (params) => {
        parseParams(params)
        return {
          status: 'parsed',
          postId: params.postId,
        }
      },
      stringifyParams: (params) => {
        stringifyParams(params)
        return {
          status: 'stringified',
          postId: params.postId,
        }
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(stringifyParams).toHaveBeenCalledWith({ postId: 2 })

    expect(postLink).toHaveAttribute('href', '/2')

    fireEvent.click(postLink)

    const posts2Text = await screen.findByText('Post: 2')
    expect(posts2Text).toBeInTheDocument()

    expect(parseParams).toHaveBeenCalledWith({ status: 'parsed', postId: '2' })
  })

  test('when navigating to /$postId with params.parse and params.stringify', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <Link to="/$postId" params={{ postId: 2 }}>
          Go to post
        </Link>
      ),
    })

    const parseParams = vi.fn()
    const stringifyParams = vi.fn()

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return <div>Post: {params.postId}</div>
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      params: {
        parse: (params) => {
          parseParams(params)
          return {
            status: 'parsed',
            postId: params.postId,
          }
        },
        stringify: (params) => {
          stringifyParams(params)
          return {
            status: 'stringified',
            postId: params.postId,
          }
        },
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'Go to post',
    })

    expect(stringifyParams).toHaveBeenCalledWith({ postId: 2 })

    expect(postLink).toHaveAttribute('href', '/2')

    fireEvent.click(postLink)

    const posts2Text = await screen.findByText('Post: 2')
    expect(posts2Text).toBeInTheDocument()

    expect(parseParams).toHaveBeenCalledWith({ status: 'parsed', postId: '2' })
  })

  test('when navigating to /$postId with params.parse and params.stringify handles falsey inputs', async () => {
    const rootRoute = createRootRoute()

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <Link to="/$postId" params={{ postId: 2 }}>
            Go to post 2
          </Link>
          <Link to="/$postId" params={{ postId: 0 }}>
            Go to post 0
          </Link>
        </>
      ),
    })

    const stringifyParamsMock = vi.fn()

    const parseParams = ({ postId }: { postId: string }) => {
      return {
        postId: parseInt(postId),
      }
    }

    const stringifyParams = ({ postId }: { postId: number }) => {
      stringifyParamsMock({ postId })
      return {
        postId: postId.toString(),
      }
    }

    const PostComponent = () => {
      const params = useParams({ strict: false })
      return <div>Post: {params.postId}</div>
    }

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '$postId',
      params: {
        parse: parseParams,
        stringify: stringifyParams,
      },
      component: PostComponent,
    })

    const routeTree = rootRoute.addChildren([indexRoute, postRoute])
    const router = createRouter({ routeTree })

    render(() => <RouterProvider router={router} />)

    const postLink2 = await screen.findByRole('link', {
      name: 'Go to post 2',
    })
    const postLink0 = await screen.findByRole('link', {
      name: 'Go to post 0',
    })

    expect(postLink2).toHaveAttribute('href', '/2')
    expect(postLink0).toHaveAttribute('href', '/0')

    expect(stringifyParamsMock).toHaveBeenCalledWith({ postId: 2 })
    expect(stringifyParamsMock).toHaveBeenCalledWith({ postId: 0 })
  })

  test.each([false, 'intent', 'render'] as const)(
    'Router.preload="%s", should not trigger the IntersectionObserver\'s observe and disconnect methods',
    async (preload) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <h1>Index Heading</h1>
            <Link to="/">Index Link</Link>
          </>
        ),
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        defaultPreload: preload,
      })

      render(() => <RouterProvider router={router} />)

      const indexLink = await screen.findByRole('link', { name: 'Index Link' })
      expect(indexLink).toBeInTheDocument()

      expect(ioObserveMock).not.toBeCalled()
      expect(ioDisconnectMock).not.toBeCalled()
    },
  )

  test.each([false, 'intent', 'viewport', 'render'] as const)(
    'Router.preload="%s" with Link.preload="false", should not trigger the IntersectionObserver\'s observe method',
    async (preload) => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <h1>Index Heading</h1>
            <Link to="/" preload={false}>
              Index Link
            </Link>
          </>
        ),
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        defaultPreload: preload,
      })

      render(() => <RouterProvider router={router} />)

      const indexLink = await screen.findByRole('link', { name: 'Index Link' })
      expect(indexLink).toBeInTheDocument()

      expect(ioObserveMock).not.toBeCalled()
    },
  )

  test('Router.preload="viewport", should trigger the IntersectionObserver\'s observe and disconnect methods', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <h1>Index Heading</h1>
          <Link to="/">Index Link</Link>
        </>
      ),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      defaultPreload: 'viewport',
    })

    render(() => <RouterProvider router={router} />)

    const indexLink = await screen.findByRole('link', { name: 'Index Link' })
    expect(indexLink).toBeInTheDocument()

    expect(ioObserveMock).toBeCalled()
    expect(ioObserveMock).toBeCalledTimes(2) // since Solid.StrictMode is enabled it double renders

    expect(ioDisconnectMock).toBeCalled()
    expect(ioDisconnectMock).toBeCalledTimes(1) // since Solid.StrictMode is enabled it should have disconnected
  })

  test("Router.preload='render', should trigger the route loader on render", async () => {
    const mock = vi.fn()

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => {
        mock()
      },
      component: () => (
        <>
          <h1>Index Heading</h1>
          <Link to="/about">About Link</Link>
        </>
      ),
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => (
        <>
          <h1>About Heading</h1>
        </>
      ),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([aboutRoute, indexRoute]),
      defaultPreload: 'render',
    })

    render(() => <RouterProvider router={router} />)

    const aboutLink = await screen.findByRole('link', { name: 'About Link' })
    expect(aboutLink).toBeInTheDocument()

    expect(mock).toHaveBeenCalledTimes(1)
  })

  test('Router.preload="intent", pendingComponent renders during unresolved route loader', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <div>
            <h1>Index page</h1>
            <Link to="/posts" preload="intent">
              link to posts
            </Link>
          </div>
        )
      },
    })

    const postRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: () => sleep(WAIT_TIME),
      component: () => <div>Posts page</div>,
    })

    const routeTree = rootRoute.addChildren([postRoute, indexRoute])
    const router = createRouter({
      routeTree,
      defaultPreload: 'intent',
      defaultPendingMs: 200,
      defaultPendingComponent: () => <p>Loading...</p>,
    })

    render(() => <RouterProvider router={router} />)

    const linkToPosts = await screen.findByRole('link', {
      name: 'link to posts',
    })
    expect(linkToPosts).toBeInTheDocument()

    fireEvent.focus(linkToPosts)
    fireEvent.click(linkToPosts)

    const loadingElement = await screen.findByText('Loading...')
    expect(loadingElement).toBeInTheDocument()

    const postsElement = await screen.findByText('Posts page')
    expect(postsElement).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
  })

  describe('when preloading a link, `preload` should be', () => {
    async function runTest({
      expectedPreload,
      testIdToHover,
    }: {
      expectedPreload: boolean
      testIdToHover: string
    }) {
      const rootRoute = createRootRoute({
        component: () => {
          return (
            <>
              <Link
                data-testid="link-1"
                to="/posts/$postId"
                params={{ postId: 'id1' }}
              >
                To first post
              </Link>
              <Link
                data-testid="link-2"
                to="/posts/$postId"
                params={{ postId: 'id2' }}
              >
                To second post
              </Link>
              <Outlet />
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

      const PostsComponent = () => {
        return (
          <>
            <h1>Posts</h1>
            <Outlet />
          </>
        )
      }

      const postsBeforeLoadFn = vi.fn()
      const postsLoaderFn = vi.fn()

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'posts',
        component: PostsComponent,
        beforeLoad: postsBeforeLoadFn,
        loader: postsLoaderFn,
      })

      const PostComponent = () => {
        const params = useParams({ strict: false })
        return (
          <>
            <span>Params: {params.postId}</span>
          </>
        )
      }

      const postBeforeLoadFn = vi.fn()
      const postLoaderFn = vi.fn()

      const postRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '$postId',
        component: PostComponent,
        beforeLoad: postBeforeLoadFn,
        loader: postLoaderFn,
      })

      const routeTree = rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postRoute]),
      ])

      const router = createRouter({
        routeTree,
        defaultPreload: 'intent',
      })

      render(() => <RouterProvider router={router} />)
      const link = await screen.findByTestId(testIdToHover)
      fireEvent.mouseOver(link)

      const expected = expect.objectContaining({ preload: expectedPreload })
      await waitFor(() =>
        expect(postsBeforeLoadFn).toHaveBeenCalledWith(expected),
      )
      await waitFor(() => expect(postsLoaderFn).toHaveBeenCalledWith(expected))

      await waitFor(() =>
        expect(postBeforeLoadFn).toHaveBeenCalledWith(expected),
      )
      await waitFor(() => expect(postLoaderFn).toHaveBeenCalledWith(expected))
    }
    test('`true` when on / and hovering `/posts/id1` ', async () => {
      await runTest({ expectedPreload: true, testIdToHover: 'link-1' })
    })

    test('`false` when on `/posts/id1` and hovering `/posts/id1`', async () => {
      window.history.replaceState(null, 'root', '/posts/id1')
      await runTest({ expectedPreload: false, testIdToHover: 'link-1' })
    })

    test('`true` when on `/posts/id1` and hovering `/posts/id2`', async () => {
      window.history.replaceState(null, 'root', '/posts/id1')
      await runTest({ expectedPreload: false, testIdToHover: 'link-2' })
    })
  })
})

describe('createLink', () => {


  it('should pass the "disabled" prop to the rendered target element', async () => {
    const CustomLink = createLink('button')

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <CustomLink to="/" disabled>
          Index
        </CustomLink>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const customElement = await screen.findByText('Index')

    expect(customElement).toBeDisabled()
    expect(customElement.getAttribute('disabled')).toBe('')
  })

  it('should pass the "foo" prop to the rendered target element', async () => {
    const CustomLink = createLink('button')

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <CustomLink
          to="/"
          // @ts-expect-error
          foo="bar"
        >
          Index
        </CustomLink>
      ),
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const customElement = await screen.findByText('Index')

    expect(customElement.hasAttribute('foo')).toBe(true)
    expect(customElement.getAttribute('foo')).toBe('bar')
  })

  it('should pass activeProps and inactiveProps to the custom link', async () => {
    const Button: Solid.Component<
      Solid.ParentProps<{
        active?: boolean
        foo?: boolean
        overrideMeIfYouWant: string
      }>
    > = (props) => {
      const [local, rest] = Solid.splitProps(props, [
        'active',
        'foo',
        'children',
      ])

      return (
        <button {...rest}>
          active: {local.active ? 'yes' : 'no'} - foo:{' '}
          {local.foo ? 'yes' : 'no'} - {local.children}
        </button>
      )
    }

    const ButtonLink = createLink(Button)

    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <>
          <ButtonLink
            to="/"
            overrideMeIfYouWant="Button1"
            activeProps={{
              active: true,
              'data-hello': 'world',
              overrideMeIfYouWant: 'overridden-by-activeProps',
            }}
            inactiveProps={{ foo: true }}
          >
            Button1
          </ButtonLink>
          <ButtonLink
            to="/posts"
            overrideMeIfYouWant="Button2"
            activeProps={{
              active: true,
              'data-hello': 'world',
            }}
            inactiveProps={{
              foo: true,
              'data-hello': 'void',
              overrideMeIfYouWant: 'overridden-by-inactiveProps',
            }}
          >
            Button2
          </ButtonLink>
          <ButtonLink
            to="/posts"
            overrideMeIfYouWant="Button3"
            activeProps={{
              active: true,
            }}
            inactiveProps={{
              active: false,
            }}
          >
            Button3
          </ButtonLink>
        </>
      ),
    })
    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(() => <RouterProvider router={router} />)

    const button1 = await screen.findByText('active: yes - foo: no - Button1')
    expect(button1.getAttribute('data-hello')).toBe('world')
    expect(button1.getAttribute('overrideMeIfYouWant')).toBe(
      'overridden-by-activeProps',
    )

    const button2 = await screen.findByText('active: no - foo: yes - Button2')
    expect(button2.getAttribute('data-hello')).toBe('void')
    expect(button2.getAttribute('overrideMeIfYouWant')).toBe(
      'overridden-by-inactiveProps',
    )

    const button3 = await screen.findByText('active: no - foo: no - Button3')
    expect(button3.getAttribute('overrideMeIfYouWant')).toBe('Button3')
  })
})

describe('search middleware', () => {
  test('legacy search filters still work', async () => {
    const rootRoute = createRootRoute({
      validateSearch: (input) => {
        return {
          root: input.root as string | undefined,
          foo: input.foo as string | undefined,
        }
      },
      preSearchFilters: [
        (search) => {
          return { ...search, foo: 'foo' }
        },
      ],
      postSearchFilters: [
        (search) => {
          return { ...search, root: search.root ?? 'default' }
        },
      ],
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <>
            <h1>Index</h1>
            <Link to="/posts" search={(p: any) => ({ page: 123, foo: p.foo })}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)
        return {
          page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/?foo=bar'] }),
    })

    render(() => <RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })
    expect(postsLink).toHaveAttribute('href')
    const href = postsLink.getAttribute('href')
    const search = getSearchParamsFromURI(href!)
    expect(search.size).toBe(3)
    expect(search.get('page')).toBe('123')
    expect(search.get('root')).toBe('default')
    expect(search.get('foo')).toBe('foo')
  })

  test('search middlewares work', async () => {
    const rootRoute = createRootRoute({
      validateSearch: (input) => {
        return {
          root: input.root as string | undefined,
          foo: input.foo as string | undefined,
        }
      },
      search: {
        middlewares: [
          ({ search, next }) => {
            return next({ ...search, foo: 'foo' })
          },
          ({ search, next }) => {
            expect(search.foo).toBe('foo')
            const { root, ...result } = next({ ...search, foo: 'hello' })
            return { ...result, root: root ?? search.root }
          },
        ],
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        const { root } = indexRoute.useSearch()
        return (
          <>
            <h1>Index</h1>
            <div data-testid="search">{root ?? '$undefined'}</div>
            <Link
              data-testid="update-search"
              to="/"
              search={{ root: 'newValue' }}
            >
              update search
            </Link>
            <Link to="/posts" search={{ page: 123 }}>
              Posts
            </Link>
          </>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <>
          <h1>Posts</h1>
        </>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: (input: Record<string, unknown>) => {
        const page = Number(input.page)
        return {
          page,
        }
      },
      component: PostsComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/?root=abc'] }),
    })

    render(() => <RouterProvider router={router} />)

    async function checkSearchValue(value: string) {
      const searchValue = await screen.findByTestId('search')
      expect(searchValue).toHaveTextContent(value)
    }
    async function checkPostsLink(root: string) {
      const postsLink = await screen.findByRole('link', { name: 'Posts' })
      expect(postsLink).toHaveAttribute('href')
      const href = postsLink.getAttribute('href')
      const search = getSearchParamsFromURI(href!)
      expect(search.size).toBe(2)
      expect(search.get('page')).toBe('123')
      expect(search.get('root')).toBe(root)
    }
    await checkSearchValue('abc')
    await checkPostsLink('abc')

    const updateSearchLink = await screen.findByTestId('update-search')
    fireEvent.click(updateSearchLink)
    await checkSearchValue('newValue')
    await checkPostsLink('newValue')
    expect(router.state.location.search).toEqual({ root: 'newValue' })
  })

  test('search middlewares work with redirect', async () => {
    const rootRoute = createRootRoute({
      validateSearch: z.object({ root: z.string().optional() }),
      component: () => {
        return (
          <>
            <h1>Root</h1>
            <Link
              data-testid="root-link-posts"
              search={{ foo: 'default' }}
              to="/posts"
            >
              posts
            </Link>{' '}
            <Link data-testid="root-link-invoices" to="/invoices">
              invoices
            </Link>
            <Outlet />
          </>
        )
      },
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      beforeLoad: () => {
        throw redirect({ to: '/posts' })
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      validateSearch: z.object({
        foo: z.string().default('default'),
      }),
      search: {
        middlewares: [
          // this means we cannot get the correct input type for this schema
          stripSearchParams({ foo: 'default' }),
          retainSearchParams(true),
        ],
      },

      component: () => {
        const { foo } = postsRoute.useSearch()
        return (
          <>
            <h1>Posts</h1>
            <div data-testid="posts-search">{foo}</div>
            <Link data-testid="posts-link-new" to="/posts/new">
              new
            </Link>
          </>
        )
      },
    })

    const postsNewRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: 'new',
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        postsRoute.addChildren([postsNewRoute]),
        invoicesRoute,
      ]),
    })

    window.history.replaceState(null, 'root', '/?root=abc')

    render(() => <RouterProvider router={router} />)

    const searchValue = await screen.findByTestId('posts-search')
    expect(searchValue).toHaveTextContent('default')

    expect(router.state.location.pathname).toBe('/posts')
    expect(router.state.location.search).toEqual({ root: 'abc' })

    // link to sibling does not retain search param
    const invoicesLink = await screen.findByTestId('root-link-invoices')
    expect(invoicesLink).toHaveAttribute('href')
    const invoicesLinkHref = invoicesLink.getAttribute('href')
    const invoicesLinkSearch = getSearchParamsFromURI(invoicesLinkHref!)
    expect(invoicesLinkSearch.size).toBe(0)

    // link to child retains search param
    const postsNewLink = await screen.findByTestId('posts-link-new')
    expect(postsNewLink).toHaveAttribute('href')
    const postsNewLinkHref = postsNewLink.getAttribute('href')
    const postsNewLinkSearch = getSearchParamsFromURI(postsNewLinkHref!)
    expect(postsNewLinkSearch.size).toBe(1)
    expect(postsNewLinkSearch.get('root')).toBe('abc')

    const postsLink = await screen.findByTestId('root-link-posts')
    expect(postsLink).toHaveAttribute('href')
    const postsLinkHref = postsNewLink.getAttribute('href')
    const postsLinkSearch = getSearchParamsFromURI(postsLinkHref!)
    expect(postsLinkSearch.size).toBe(1)
    expect(postsLinkSearch.get('root')).toBe('abc')
    expect(postsLink).toHaveAttribute('data-status', 'active')
  })

  describe('reloadDocument', () => {
    test('link to /posts with params', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => {
          return (
            <>
              <h1>Index</h1>
              <Link
                to="/posts/$postId"
                params={{ postId: 'id1' }}
                reloadDocument={true}
                data-testid="link-to-post-1"
              >
                To first post
              </Link>
            </>
          )
        },
      })

      const PostsComponent = () => {
        return (
          <>
            <h1>Posts</h1>
            <Link to="/">Index</Link>
            <Outlet />
          </>
        )
      }

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'posts',
        component: PostsComponent,
      })

      const PostComponent = () => {
        const params = useParams({ strict: false })
        return <span>Params: {params.postId}</span>
      }

      const postRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '$postId',
        component: PostComponent,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([
          indexRoute,
          postsRoute.addChildren([postRoute]),
        ]),
      })

      render(() => <RouterProvider router={router} />)

      const postLink = await screen.findByTestId('link-to-post-1')

      expect(postLink).toHaveAttribute('href', '/posts/id1')
    })
  })
})
