import React, { useRef } from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createRouteMask,
  redirect,
  useLoaderData,
  useParams,
  useSearch,
  useRouteContext,
  useMatchRoute,
  useRouterState,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

describe('Link', () => {
  test('when using renderHook it returns a hook with same content to prove rerender works', async () => {
    /**
     * This is the hook that will be testet.
     *
     * @returns custom state
     */
    const useLocationFromState = () => {
      const { location } = useRouterState()

      // could return anything just to prove it will work.
      const memoLocation = React.useMemo(() => {
        return {
          href: location.href,
          pathname: location.pathname,
        }
      }, [location.href, location.pathname])

      return memoLocation
    }

    const IndexComponent = ({ children }: { children: React.ReactNode }) => {
      return <h1 data-testid="testId">{children}</h1>
    }
    const RouterContainer = ({ children }: { children: React.ReactNode }) => {
      const childrenRef = useRef(children)
      const memoedRouteTree = React.useMemo(() => {
        const rootRoute = createRootRoute()
        const indexRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          component: () => (
            <IndexComponent>{childrenRef.current}</IndexComponent>
          ),
        })
        return rootRoute.addChildren([indexRoute])
      }, [])

      const memoedRouter = React.useMemo(() => {
        const router = createRouter({
          routeTree: memoedRouteTree,
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })

        return router
      }, [memoedRouteTree])
      return <RouterProvider router={memoedRouter} />
    }

    const { result, rerender } = renderHook(
      () => {
        return useLocationFromState()
      },
      { wrapper: RouterContainer },
    )
    await waitFor(() => expect(screen.getByTestId('testId')).toBeVisible())
    expect(result.current).toBeTruthy()

    const original = result.current

    rerender()

    await waitFor(() => expect(screen.getByTestId('testId')).toBeVisible())
    const updated = result.current

    expect(original).toBe(updated)
  })

  test('when a Link is disabled', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => (
        <React.Fragment>
          <h1>Index</h1>
          <Link to="/posts" disabled>
            Posts
          </Link>
        </React.Fragment>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => (
        <React.Fragment>
          <h1>Posts</h1>
        </React.Fragment>
      ),
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/" activeProps={{ className: 'active' }}>
              Index
            </Link>
            <Link to="/posts" inactiveProps={{ className: 'inactive' }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <React.Fragment>
            <h1>Posts</h1>
          </React.Fragment>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/" activeProps={{ className: 'active' }}>
              Index
            </Link>
            <Link to="/posts" inactiveProps={{ className: 'inactive' }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <React.Fragment>
            <h1>Posts</h1>
          </React.Fragment>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Oops! Something went wrong!'))
    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/">Index</Link>
            <Link to="/posts">Posts</Link>
          </React.Fragment>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <React.Fragment>
            <h1>Posts</h1>
            <Link to="/">Index</Link>
            <Link to="/posts" activeProps={{ className: 'active' }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
    })

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/">Index</Link>
            <Link to="/posts">Posts</Link>
          </React.Fragment>
        )
      },
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      component: () => {
        return (
          <React.Fragment>
            <h1>Posts</h1>
            <Link to="/">Index</Link>
            <Link to="/posts" activeProps={{ className: 'active' }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
      basepath: '/app',
    })

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 0 }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      const search = useSearch({ strict: false })
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <span>Page: {search.page}</span>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=0')

    fireEvent.click(postsLink)

    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts')
    expect(window.location.search).toBe('?page=0')

    await screen.findByText('Page: 0')
  })

  test('when navigating to /posts with invalid search', async () => {
    const rootRoute = createRootRoute()
    const onError = vi.fn()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 'invalid' }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      const search = useSearch({ strict: false })
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <span>Page: {search.page}</span>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=invalid')

    fireEvent.click(postsLink)

    await waitFor(() => expect(onError).toHaveBeenCalledOnce())

    expect(
      await screen.findByText('Oops, something went wrong'),
    ).toBeInTheDocument()
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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      const data = useLoaderData({ strict: false })
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <span>Page: {data.pageDoubled}</span>
        </React.Fragment>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: loader,
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=2')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Page: 4')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      const loader = useLoaderData({ strict: false })
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <span>Page: {loader.pageDoubled}</span>
        </React.Fragment>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      loaderDeps: (opts) => ({ page: opts.search }),
      loader: () => {
        throw new Error()
      },
      onError,
      errorComponent: () => <span>Something went wrong!</span>,
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts?page=2')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Something went wrong!'))

    expect(onError).toHaveBeenCalledOnce()
  })

  test('when navigating to /posts with a beforeLoad that redirects', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts" search={{ page: 2 }}>
              Posts
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(await screen.findByText('Auth!')).toBeInTheDocument()
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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      const context = useRouteContext({ strict: false })
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <span>UserId: {context.userId}</span>
          <span>Username: {context.username}</span>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(await screen.findByText('UserId: userId')).toBeInTheDocument()
  })

  test('when navigating to /posts with a beforeLoad that throws an error', async () => {
    const onError = vi.fn()
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(
      await screen.findByText('Oops! Something went wrong!'),
    ).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    fireEvent.click(postsLink)

    expect(
      await screen.findByText('Oops! Something went wrong!'),
    ).toBeInTheDocument()
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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              Post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', { name: 'Post' })

    fireEvent.click(postLink)

    expect(
      await screen.findByText('Oops! Something went wrong!'),
    ).toBeInTheDocument()
  })

  test('when navigating to /posts with params', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Link to="/">Index</Link>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
        </React.Fragment>
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
        postsRoute.addChildren([postRoute]),
      ]),
    })

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()
  })

  test('when navigating from /posts to ./$postId', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostsIndexComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts Index</h1>
          <Link from="/posts/" to="./$postId" params={{ postId: 'id1' }}>
            To the first post
          </Link>
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Link to="/">Index</Link>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Posts Index')).toBeInTheDocument()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toBe('/posts/id1')
  })

  test('when navigating from /posts to ../posts/$postId', async () => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => {
        return (
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
      )
    }

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: PostsComponent,
    })

    const PostsIndexComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts Index</h1>
          <Link from="/posts/" to="../posts/$postId" params={{ postId: 'id1' }}>
            To the first post
          </Link>
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Link to="/">Index</Link>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'Posts' })

    expect(postsLink).toHaveAttribute('href', '/posts')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Posts Index')).toBeInTheDocument()

    const postLink = await screen.findByRole('link', {
      name: 'To the first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()
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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    expect(await screen.findByText('Information')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    expect(await screen.findByText('Params: id1'))

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    expect(await screen.findByText('Information')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    expect(await screen.findByText('Params: id1'))

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute('href', '/posts/id1/info')

    fireEvent.click(informationLink)

    expect(await screen.findByText('Information')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    expect(await screen.findByText('Params: id1'))

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const rootLink = await screen.findByRole('link', {
      name: 'To Root',
    })

    expect(rootLink).toHaveAttribute('href', '/')

    fireEvent.click(rootLink)

    expect(await screen.findByText('Index')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link
              to="/posts/$postId/details"
              params={{ postId: 'id1' }}
              search={{ page: 2 }}
            >
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details?page=2')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const informationLink = await screen.findByRole('link', {
      name: 'To Information',
    })

    expect(informationLink).toHaveAttribute(
      'href',
      '/posts/id1/info?page=2&more=true',
    )

    fireEvent.click(informationLink)

    expect(await screen.findByText('Information')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/info')

    expect(await screen.findByText('Params: id1'))

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const postLink = await screen.findByRole('link', {
      name: 'To Post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Posts')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(await screen.findByText('Params: id1')).toBeInTheDocument()

    expect(window.location.pathname).toEqual('/posts/id1/details')

    const postLink = await screen.findByRole('link', {
      name: 'To Post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Posts')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts">Posts</Link>
            <Link to="/posts/$postId/details" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
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
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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
      return (
        <>
          <span>invoiceId: {params.invoiceId}</span>
        </>
      )
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

    render(<RouterProvider router={router} />)

    const postsLink = await screen.findByRole('link', { name: 'To first post' })

    expect(postsLink).toHaveAttribute('href', '/posts/id1/details')

    fireEvent.click(postsLink)

    expect(
      await screen.findByText(
        'Invariant failed: Could not find match for from: /invoices',
      ),
    ).toBeInTheDocument()
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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId/info" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const InformationComponent = () => {
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

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
          <React.Fragment>
            <h1>Index</h1>
            <Link
              to="/posts/$postId/info"
              params={{ postId: 'id1' }}
              mask={{ to: '/posts/$postId', params: { postId: 'id1' } }}
            >
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
      )
    }

    const postRoute = createRoute({
      getParentRoute: () => postsRoute,
      path: '$postId',
      component: PostComponent,
    })

    const InformationComponent = () => {
      return (
        <React.Fragment>
          <h1>Information</h1>
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      const [status, setStatus] = React.useState<'idle' | 'success' | 'error'>(
        'idle',
      )

      React.useEffect(() => {
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
      }, [])

      return (
        <React.Fragment>
          {status === 'success' ? 'Login!' : 'Waiting...'}
        </React.Fragment>
      )
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(loaderFn).toHaveBeenCalled())

    expect(search).toHaveBeenCalledWith({ postPage: 0 })

    fireEvent.click(postLink)

    expect(await screen.findByText('Login!')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return <React.Fragment>Login!</React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Login!')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return <React.Fragment>Login!</React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.click(postLink)

    expect(await screen.findByText('Login!')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return <React.Fragment>Login!</React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(search).toHaveBeenCalledWith({ postPage: 0 }))

    fireEvent.click(postLink)

    expect(await screen.findByText('Login!')).toBeInTheDocument()

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
          <React.Fragment>
            <h1>Index</h1>
            <Link to="/posts/$postId" params={{ postId: 'id1' }}>
              To first post
            </Link>
          </React.Fragment>
        )
      },
    })

    const PostsComponent = () => {
      return (
        <React.Fragment>
          <h1>Posts</h1>
          <Outlet />
        </React.Fragment>
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
        <React.Fragment>
          <span>Params: {params.postId}</span>
          <Outlet />
        </React.Fragment>
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
      return <React.Fragment>Login!</React.Fragment>
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

    render(<RouterProvider router={router} />)

    const postLink = await screen.findByRole('link', {
      name: 'To first post',
    })

    expect(postLink).toHaveAttribute('href', '/posts/id1')

    fireEvent.mouseOver(postLink)

    await waitFor(() => expect(search).toHaveBeenCalledWith({ postPage: 0 }))

    fireEvent.click(postLink)

    expect(await screen.findByText('Login!')).toBeInTheDocument()

    expect(ErrorComponent).not.toHaveBeenCalled()
  })

  test('when navigating from /posts to /invoices with conditionally rendering Link on the root', async () => {
    const ErrorComponent = vi.fn(() => <div>Something went wrong!</div>)
    const RootComponent = () => {
      const matchRoute = useMatchRoute()
      const matchPosts = Boolean(matchRoute({ to: '/posts' }))
      const matchInvoices = Boolean(matchRoute({ to: '/invoices' }))

      return (
        <React.Fragment>
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
        </React.Fragment>
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
        <React.Fragment>
          <h1>Index Route</h1>
          <Link to="/posts">Go to posts</Link>
        </React.Fragment>
      ),
    })

    const postsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'posts',
      component: () => (
        <React.Fragment>
          <h1>On Posts</h1>
          <Link to="/invoices">To invoices</Link>
        </React.Fragment>
      ),
    })

    const invoicesRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: 'invoices',
      component: () => (
        <React.Fragment>
          <h1>On Invoices</h1>
          <Link to="/posts">To posts</Link>
        </React.Fragment>
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

    render(<RouterProvider router={router} />)

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

    fireEvent.click(await screen.findByRole('link', { name: 'To posts' }))

    expect(await screen.findByText('On Posts')).toBeInTheDocument()

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

    render(<RouterProvider router={router} />)

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

    render(<RouterProvider router={router} />)

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
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    const rendered = render(<RouterProvider router={router} />)
    const customElement = await rendered.findByText('Index')

    expect(customElement.hasAttribute('foo')).toBe(true)
    expect(customElement.getAttribute('foo')).toBe('bar')
  })
})
