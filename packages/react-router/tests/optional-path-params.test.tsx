import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/history'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useSearch,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

describe('React Router - Optional Path Parameters', () => {
  let history: RouterHistory

  beforeEach(() => {
    history = createMemoryHistory()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Route matching with optional parameters', () => {
    it('should match route with no optional parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts')
      render(<RouterProvider router={router} />)

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(paramsElement.textContent!)).toEqual({})
    })

    it('should match route with one optional parameter', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts/tech')
      render(<RouterProvider router={router} />)

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(paramsElement.textContent!)).toEqual({
        category: 'tech',
      })
    })

    it('should match route with all optional parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts/tech/hello-world')
      render(<RouterProvider router={router} />)

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(paramsElement.textContent!)).toEqual({
        category: 'tech',
        slug: 'hello-world',
      })
    })

    it('should handle mixed required and optional parameters', async () => {
      const rootRoute = createRootRoute()
      const usersRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users/$id/{-tab}',
        component: () => {
          const params = usersRoute.useParams()
          return (
            <div>
              <h1>User Profile</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const testCases = [
        { path: '/users/123', expectedParams: { id: '123' } },
        {
          path: '/users/123/settings',
          expectedParams: { id: '123', tab: 'settings' },
        },
      ]

      for (const { path, expectedParams } of testCases) {
        const router = createRouter({
          routeTree: rootRoute.addChildren([usersRoute]),
          history,
        })

        history.push(path)
        const { unmount } = render(<RouterProvider router={router} />)

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual(expectedParams)

        unmount()
      }
    })
  })

  describe('Link component with optional parameters', () => {
    it('should generate correct href for optional parameters', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <Link to="/posts/{-$category}/{-$slug}" data-testid="posts-link">
              All Posts
            </Link>
            <Link
              to="/posts/{-$category}/{-$slug}"
              params={{ category: 'tech' }}
              data-testid="tech-link"
            >
              Tech Posts
            </Link>
            <Link
              to="/posts/{-$category}/{-$slug}"
              params={{ category: 'tech', slug: 'hello-world' }}
              data-testid="specific-link"
            >
              Specific Post
            </Link>
            <Link
              to="/posts/{-$category}/{-$slug}"
              params={{}}
              data-testid="empty-params-link"
            >
              Empty Params
            </Link>
          </>
        ),
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => <div>Posts</div>,
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      const postsLink = await screen.findByTestId('posts-link')
      const techLink = await screen.findByTestId('tech-link')
      const specificLink = await screen.findByTestId('specific-link')
      const emptyParamsLink = await screen.findByTestId('empty-params-link')

      expect(postsLink).toHaveAttribute('href', '/posts')
      expect(techLink).toHaveAttribute('href', '/posts/tech')
      expect(specificLink).toHaveAttribute('href', '/posts/tech/hello-world')
      expect(emptyParamsLink).toHaveAttribute('href', '/posts')
    })

    it('should navigate correctly with optional parameters', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <h1>Home</h1>
            <Link to="/posts/{-$category}/{-$slug}" data-testid="posts-link">
              All Posts
            </Link>
            <Link
              to="/posts/{-$category}/{-$slug}"
              params={{ category: 'tech' }}
              data-testid="tech-link"
            >
              Tech Posts
            </Link>
          </>
        ),
      })

      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      // Test navigation to /posts
      const postsLink = await screen.findByTestId('posts-link')
      fireEvent.click(postsLink)

      await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()
      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(paramsElement.textContent!)).toEqual({})
      expect(router.state.location.pathname).toBe('/posts')

      // Navigate back and test with parameters
      history.push('/')
      const techLink = await screen.findByTestId('tech-link')
      fireEvent.click(techLink)

      await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()
      const updatedParamsElement = await screen.findByTestId('params')
      expect(JSON.parse(updatedParamsElement.textContent!)).toEqual({
        category: 'tech',
      })
      expect(router.state.location.pathname).toBe('/posts/tech')
    })

    it('should handle optional parameters with prefix and suffix', async () => {
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <Link to="/files/prefix{-$name}.txt" data-testid="files-link">
              All Files
            </Link>
            <Link
              to="/files/prefix{-$name}.txt"
              params={{ name: 'document' }}
              data-testid="doc-link"
            >
              Document
            </Link>
          </>
        ),
      })

      const filesRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/files/prefix{-$name}.txt',
        component: () => {
          const params = filesRoute.useParams()
          return (
            <div>
              <h1>Files</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, filesRoute]),
        history,
      })

      render(<RouterProvider router={router} />)

      const filesLink = await screen.findByTestId('files-link')
      const docLink = await screen.findByTestId('doc-link')

      expect(filesLink).toHaveAttribute('href', '/files')
      expect(docLink).toHaveAttribute('href', '/files/prefixdocument.txt')
    })
  })

  describe('useNavigate with optional parameters', () => {
    it('should navigate with optional parameters programmatically', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: () => {
          const navigate = useNavigate()
          const params = postsRoute.useParams()

          return (
            <div>
              <div data-testid="params">{JSON.stringify(params)}</div>
              <button
                data-testid="navigate-all"
                onClick={() => navigate({ to: '/posts/{-$category}/{-$slug}' })}
              >
                All Posts
              </button>
              <button
                data-testid="navigate-tech"
                onClick={() =>
                  navigate({
                    to: '/posts/{-$category}/{-$slug}',
                    params: { category: 'tech' },
                  })
                }
              >
                Tech Posts
              </button>
              <button
                data-testid="navigate-specific"
                onClick={() =>
                  navigate({
                    to: '/posts/{-$category}/{-$slug}',
                    params: { category: 'tech', slug: 'hello-world' },
                  })
                }
              >
                Specific Post
              </button>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      // Start at a specific post
      history.push('/posts/tech/hello-world')
      render(<RouterProvider router={router} />)

      // Test navigation scenarios
      const navigateAll = await screen.findByTestId('navigate-all')
      const navigateTech = await screen.findByTestId('navigate-tech')
      const navigateSpecific = await screen.findByTestId('navigate-specific')

      fireEvent.click(navigateAll)
      expect(router.state.location.pathname).toBe('/posts')

      fireEvent.click(navigateTech)
      expect(router.state.location.pathname).toBe('/posts/tech')

      fireEvent.click(navigateSpecific)
      expect(router.state.location.pathname).toBe('/posts/tech/hello-world')
    })

    it('should handle relative navigation with optional parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        component: () => {
          const navigate = useNavigate()
          const params = postsRoute.useParams()

          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
              <button
                data-testid="add-category"
                onClick={() =>
                  navigate({ to: '.', params: { category: 'tech' } })
                }
              >
                Add Category
              </button>
              <button
                data-testid="remove-category"
                onClick={() => navigate({ to: '.', params: {} })}
              >
                Remove Category
              </button>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts')
      render(<RouterProvider router={router} />)

      const addCategoryBtn = await screen.findByTestId('add-category')
      const removeCategoryBtn = await screen.findByTestId('remove-category')

      // Add category
      fireEvent.click(addCategoryBtn)
      expect(router.state.location.pathname).toBe('/posts/tech')

      // Remove category
      fireEvent.click(removeCategoryBtn)
      expect(router.state.location.pathname).toBe('/posts')
    })
  })

  describe('complex routing scenarios', () => {
    it('should handle nested routes with optional parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        component: () => (
          <div>
            <h1>Posts Layout</h1>
            <Outlet />
          </div>
        ),
      })

      const postRoute = createRoute({
        getParentRoute: () => postsRoute,
        path: '/{-$slug}',
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h2>Post Detail</h2>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const testCases = [
        { path: '/posts', expectedParams: {} },
        { path: '/posts/tech', expectedParams: { category: 'tech' } },
        {
          path: '/posts/tech/hello-world',
          expectedParams: { category: 'tech', slug: 'hello-world' },
        },
      ]

      for (const { path, expectedParams } of testCases) {
        const router = createRouter({
          routeTree: rootRoute.addChildren([
            postsRoute.addChildren([postRoute]),
          ]),
          history,
        })

        history.push(path)
        const { unmount } = render(<RouterProvider router={router} />)

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual(expectedParams)

        unmount()
      }
    })

    it('should work with search parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        validateSearch: (search) => ({
          page: Number(search.page) || 1,
          sort: (search.sort as string) || 'date',
        }),
        component: () => {
          const params = postsRoute.useParams()
          const search = useSearch({ strict: false })
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
              <div data-testid="search">{JSON.stringify(search)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts/tech?page=2&sort=title')
      render(<RouterProvider router={router} />)

      const paramsElement = await screen.findByTestId('params')
      const searchElement = await screen.findByTestId('search')

      expect(JSON.parse(paramsElement.textContent!)).toEqual({
        category: 'tech',
      })
      expect(JSON.parse(searchElement.textContent!)).toEqual({
        page: 2,
        sort: 'title',
      })
    })

    it('should handle multiple consecutive optional parameters', async () => {
      const rootRoute = createRootRoute()
      const dateRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/{-year}/{-month}/{-day}',
        component: () => {
          const params = dateRoute.useParams()
          return (
            <div>
              <h1>Date Route</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const testCases = [
        { path: '/', expectedParams: {} },
        { path: '/2023', expectedParams: { year: '2023' } },
        { path: '/2023/12', expectedParams: { year: '2023', month: '12' } },
        {
          path: '/2023/12/25',
          expectedParams: { year: '2023', month: '12', day: '25' },
        },
      ]

      for (const { path, expectedParams } of testCases) {
        const router = createRouter({
          routeTree: rootRoute.addChildren([dateRoute]),
          history,
        })

        history.push(path)
        const { unmount } = render(<RouterProvider router={router} />)

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual(expectedParams)

        unmount()
      }
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle optional parameters with loaders', async () => {
      const mockLoader = vi.fn((opts) => {
        return Promise.resolve({
          category: opts.params.category || 'all',
          data: `Data for ${opts.params.category || 'all'}`,
        })
      })

      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        loader: mockLoader,
        component: () => {
          const data = postsRoute.useLoaderData()
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
              <div data-testid="loader-data">{JSON.stringify(data)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      // Test without category
      history.push('/posts')
      render(<RouterProvider router={router} />)

      await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()
      const paramsElement = await screen.findByTestId('params')
      const loaderDataElement = await screen.findByTestId('loader-data')

      expect(JSON.parse(paramsElement.textContent!)).toEqual({})
      expect(JSON.parse(loaderDataElement.textContent!)).toEqual({
        category: 'all',
        data: 'Data for all',
      })

      expect(mockLoader).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {},
        }),
      )
    })

    it('should handle beforeLoad with optional parameters', async () => {
      const mockBeforeLoad = vi.fn((opts) => {
        return {
          category: opts.params.category || 'default',
          timestamp: Date.now(),
        }
      })

      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        beforeLoad: mockBeforeLoad,
        component: () => {
          const params = postsRoute.useParams()
          return (
            <div>
              <h1>Posts</h1>
              <div data-testid="params">{JSON.stringify(params)}</div>
            </div>
          )
        },
      })

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        history,
      })

      history.push('/posts/tech')
      render(<RouterProvider router={router} />)

      await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()

      expect(mockBeforeLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { category: 'tech' },
        }),
      )
    })
  })
})
