import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from '../src'

describe('React Router - Optional Path Parameters', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.history.replaceState(null, 'root', '/')
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
      window.history.replaceState({}, '', '/posts')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

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
      window.history.replaceState({}, '', '/posts/tech')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

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
      window.history.replaceState({}, '', '/posts/tech/hello-world')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      const paramsElement = await screen.findByTestId('params')
      expect(JSON.parse(paramsElement.textContent!)).toEqual({
        category: 'tech',
        slug: 'hello-world',
      })
    })

    it.each([
      { path: '/users/123', expectedParams: { id: '123' } },
      {
        path: '/users/123/settings',
        expectedParams: { id: '123', tab: 'settings' },
      },
    ])(
      'should handle mixed required and optional parameters: $path',
      async ({ path, expectedParams }) => {
        const rootRoute = createRootRoute()
        const usersRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/users/$id/{-$tab}',
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
        window.history.replaceState({}, '', path)

        const router = createRouter({
          routeTree: rootRoute.addChildren([usersRoute]),
        })

        render(<RouterProvider router={router} />)
        await act(() => router.load())

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual(expectedParams)
      },
    )

    it.each([
      {
        path: '/',
        expectedLocale: 'en' as const,
      },
      {
        path: '/en',
        expectedLocale: 'en' as const,
      },
      {
        path: '/fr',
        expectedLocale: 'fr' as const,
      },
    ])(
      'should correctly render matches with and without optional parameter',
      async ({ path, expectedLocale }) => {
        const content = {
          en: {
            title: 'About Us',
            description: 'Learn more about our company.',
          },
          fr: {
            title: 'À Propos',
            description: 'En savoir plus sur notre entreprise.',
          },
          es: {
            title: 'Acerca de',
            description: 'Conoce más sobre nuestra empresa.',
          },
        } as const

        const rootRoute = createRootRoute()
        const localeRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/{-$locale}',
          beforeLoad: ({ params }) => {
            const currentLocale = (params.locale ||
              'en') as keyof typeof content

            return {
              content: content[currentLocale],
            }
          },
        })

        const indexRoute = createRoute({
          getParentRoute: () => localeRoute,
          path: '/',
          component: () => {
            const { content } = indexRoute.useRouteContext()
            return (
              <div data-testid="index-content">
                <h1 data-testid="index-title">{content.title}</h1>
                <p data-testid="index-description">{content.description}</p>
              </div>
            )
          },
        })

        window.history.replaceState({}, '', path)

        const router = createRouter({
          routeTree: rootRoute.addChildren([
            localeRoute.addChildren([indexRoute]),
          ]),
        })

        render(<RouterProvider router={router} />)
        await act(() => router.load())

        await screen.findByTestId('index-content')
        const titleElement = screen.getByTestId('index-title')
        const descriptionElement = screen.getByTestId('index-description')
        expect(titleElement).toHaveTextContent(content[expectedLocale].title)
        expect(descriptionElement).toHaveTextContent(
          content[expectedLocale].description,
        )
      },
    )
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
      const rootRoute = createRootRoute({
        component: () => {
          return (
            <div>
              <h1>Root Layout</h1>
              <Link to="/" data-testid="home-link">
                Home
              </Link>
              <Outlet />
            </div>
          )
        },
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
          <>
            <h1 data-testid="home-heading">Home</h1>
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
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      {
        await expect(
          screen.findByTestId('home-heading'),
        ).resolves.toBeInTheDocument()
        // Test navigation to /posts
        const postsLink = await screen.findByTestId('posts-link')
        fireEvent.click(postsLink)

        await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()
        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual({})
        expect(router.state.location.pathname).toBe('/posts')
      }

      {
        // Navigate back
        const homeLink = await screen.findByTestId('home-link')
        fireEvent.click(homeLink)
        await expect(
          screen.findByTestId('home-heading'),
        ).resolves.toBeInTheDocument()
      }

      // test with parameters
      {
        const techLink = await screen.findByTestId('tech-link')
        fireEvent.click(techLink)

        await expect(screen.findByText('Posts')).resolves.toBeInTheDocument()
        const updatedParamsElement = await screen.findByTestId('params')
        expect(JSON.parse(updatedParamsElement.textContent!)).toEqual({
          category: 'tech',
        })
        expect(router.state.location.pathname).toBe('/posts/tech')
      }
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
      })

      render(<RouterProvider router={router} />)

      const filesLink = await screen.findByTestId('files-link')
      const docLink = await screen.findByTestId('doc-link')

      expect(filesLink).toHaveAttribute('href', '/files/prefix.txt')
      expect(docLink).toHaveAttribute('href', '/files/prefixdocument.txt')
    })
  })

  describe('useNavigate with optional parameters', () => {
    it('should navigate with optional parameters programmatically', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}/{-$slug}',
        component: Component,
      })

      function Component() {
        const navigate = useNavigate()
        const params = postsRoute.useParams()

        return (
          <div>
            <div data-testid="params">{JSON.stringify(params)}</div>
            <button
              data-testid="navigate-all"
              onClick={() =>
                navigate({
                  to: '/posts/{-$category}/{-$slug}',
                  params: false,
                })
              }
            >
              All Posts
            </button>
            <button
              data-testid="navigate-tech"
              onClick={() =>
                navigate({
                  to: '/posts/{-$category}/{-$slug}',
                  params: { category: 'tech', slug: undefined },
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
      }
      // Start at a specific post
      window.history.replaceState({}, '', '/posts/tech/hello-world')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

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
        component: Component,
      })

      function Component() {
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
              onClick={() => navigate({ to: '.', params: false })}
            >
              Remove Category
            </button>
          </div>
        )
      }
      window.history.replaceState({}, '', '/posts')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

      expect(await screen.findByTestId('params')).toHaveTextContent(
        JSON.stringify({}),
      )

      const addCategoryBtn = await screen.findByTestId('add-category')
      const removeCategoryBtn = await screen.findByTestId('remove-category')

      // Add category
      fireEvent.click(addCategoryBtn)
      expect(await screen.findByTestId('params')).toHaveTextContent(
        JSON.stringify({ category: 'tech' }),
      )
      expect(router.state.location.pathname).toBe('/posts/tech')

      // Remove category
      fireEvent.click(removeCategoryBtn)
      expect(await screen.findByTestId('params')).toHaveTextContent(
        JSON.stringify({}),
      )
      expect(router.state.location.pathname).toBe('/posts')
    })
  })

  describe('complex routing scenarios', () => {
    it.each([
      {
        path: '/posts',
        expected: {
          posts: {
            rendered: true,
            category: 'undefined',
          },
          post: {
            rendered: false,
          },
        },
      },
      {
        path: '/posts/tech',
        expected: {
          posts: {
            rendered: true,
            category: 'tech',
          },
          post: {
            rendered: false,
          },
        },
      },
      {
        path: '/posts/tech/hello-world',
        expected: {
          posts: {
            rendered: true,
            category: 'tech',
          },
          post: {
            rendered: true,
            slug: 'hello-world',
          },
        },
      },
    ])(
      'should handle nested routes with optional parameters: $path',
      async ({ path, expected }) => {
        const rootRoute = createRootRoute()
        const postsRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/posts/{-$category}',
          component: () => {
            const { category } = postsRoute.useParams()
            return (
              <div>
                <h1>Posts Layout</h1>
                <div data-testid="category-param">
                  {category ?? 'undefined'}
                </div>
                <Outlet />
              </div>
            )
          },
        })

        const postRoute = createRoute({
          getParentRoute: () => postsRoute,
          path: '/{-$slug}',
          component: () => {
            const { slug } = postsRoute.useParams()
            return (
              <div>
                <h2>Post Detail</h2>
                <div data-testid="slug-param">{slug ?? undefined}</div>
              </div>
            )
          },
        })

        window.history.replaceState({}, '', path)

        const router = createRouter({
          routeTree: rootRoute.addChildren([
            postsRoute.addChildren([postRoute]),
          ]),
        })

        render(<RouterProvider router={router} />)
        await act(() => router.load())
        if (expected.posts.rendered) {
          const categoryParam = await screen.findByTestId('category-param')
          expect(categoryParam).toHaveTextContent(expected.posts.category)
        }
        if (expected.post.rendered) {
          const slugParam = await screen.findByTestId('slug-param')
          expect(slugParam).toHaveTextContent(expected.post.slug!)
        }
      },
    )

    it('should work with search parameters', async () => {
      const rootRoute = createRootRoute()
      const postsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/posts/{-$category}',
        validateSearch: (search) => ({
          page: Number(search.page) || 1,
          sort: (search.sort as string) || 'date',
        }),
        component: Component,
      })

      function Component() {
        const params = postsRoute.useParams()
        const search = postsRoute.useSearch()
        return (
          <div>
            <h1>Posts</h1>
            <div data-testid="params">{JSON.stringify(params)}</div>
            <div data-testid="search">{JSON.stringify(search)}</div>
          </div>
        )
      }

      window.history.replaceState({}, '', '/posts/tech?page=2&sort=title')
      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      render(<RouterProvider router={router} />)
      await act(() => router.load())

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

    it.each([
      { path: '/', expectedParams: {} },
      { path: '/2023', expectedParams: { year: '2023' } },
      { path: '/2023/12', expectedParams: { year: '2023', month: '12' } },
      {
        path: '/2023/12/25',
        expectedParams: { year: '2023', month: '12', day: '25' },
      },
    ])(
      'should handle multiple consecutive optional parameters: $path',
      async ({ path, expectedParams }) => {
        const rootRoute = createRootRoute()
        const dateRoute = createRoute({
          getParentRoute: () => rootRoute,
          path: '/{-$year}/{-$month}/{-$day}',
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

        window.history.replaceState({}, '', path)

        const router = createRouter({
          routeTree: rootRoute.addChildren([dateRoute]),
        })

        render(<RouterProvider router={router} />)
        await act(() => router.load())

        const paramsElement = await screen.findByTestId('params')
        expect(JSON.parse(paramsElement.textContent!)).toEqual(expectedParams)
      },
    )
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
      window.history.replaceState({}, '', '/posts')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

      // Test without category
      render(<RouterProvider router={router} />)
      await act(() => router.load())

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
      window.history.replaceState({}, '', '/posts/tech')

      const router = createRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
      })

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
