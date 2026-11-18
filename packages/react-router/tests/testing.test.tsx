import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createLazyRoute,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  redirect,
  rootRouteId,
} from '../src'
import { createIsolatedTestRouter, createTestRouter } from '../src/testing'
import type { SearchSchemaInput } from '../src'

afterEach(() => {
  cleanup()
})

interface User {
  id: string
  name: string
}

interface Session {
  user: User | null
}

interface Post {
  id: string
  title: string
}

const realUser: User = { id: 'real', name: 'Real user' }
const testUser: User = { id: 'test', name: 'Test user' }

function createApp() {
  const calls: Array<string> = []
  const loadLazyRoute = vi.fn(() =>
    Promise.resolve(
      createLazyRoute('/lazy')({ component: () => <p>Lazy component</p> }),
    ),
  )

  const rootRoute = createRootRouteWithContext<{ locale: string }>()({
    beforeLoad: (): { session: Session } => {
      calls.push('root.beforeLoad')
      return { session: { user: realUser } }
    },
    component: () => (
      <div>
        <p>App shell</p>
        <Outlet />
      </div>
    ),
  })

  const authedRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_authed',
    beforeLoad: ({ context }) => {
      calls.push('authed.beforeLoad')
      if (!context.session.user) {
        throw redirect({ to: '/login' })
      }
      return { user: context.session.user }
    },
    loader: () => {
      calls.push('authed.loader')
      return { unreadCount: 1 }
    },
    component: () => (
      <div>
        <p>Authed layout</p>
        <Outlet />
      </div>
    ),
  })

  const postRoute = createRoute({
    getParentRoute: () => authedRoute,
    path: '/posts/$postId',
    validateSearch: (
      search: { tab?: string } & SearchSchemaInput,
    ): { tab: string } => {
      if (search.tab === 'broken') {
        throw new Error('Unknown tab')
      }
      return { tab: search.tab ?? 'details' }
    },
    context: () => {
      calls.push('post.context')
      return { scope: 'real scope' }
    },
    loader: ({ params }): { post: Post } => {
      calls.push('post.loader')
      return { post: { id: params.postId, title: 'Real post' } }
    },
    component: PostPage,
  })

  function PostPage() {
    return (
      <article>
        <p>Post page</p>
        <PostHeader />
      </article>
    )
  }

  // Reads the state of its own route and of an ancestor through the route
  // objects, the way components in route files do.
  function PostHeader() {
    const { post } = postRoute.useLoaderData()
    const { user, locale, scope } = postRoute.useRouteContext()
    const { tab } = postRoute.useSearch()
    const { unreadCount } = authedRoute.useLoaderData()

    return (
      <header>
        <h1>{post.title}</h1>
        <p>
          {`${user.name} reads post ${post.id} in ${locale} on tab ${tab} with ${unreadCount} unread in ${scope}`}
        </p>
        <Link to="/login">Sign out</Link>
      </header>
    )
  }

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login page</p>,
  })

  const lazyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lazy',
  }).lazy(loadLazyRoute)

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Home page</p>,
  })

  const routeTree = rootRoute.addChildren([
    authedRoute.addChildren([postRoute]),
    loginRoute,
    lazyRoute,
    indexRoute,
  ])

  return {
    routeTree,
    authedRoute,
    postRoute,
    PostHeader,
    calls,
    loadLazyRoute,
  }
}

const seededContext = {
  locale: 'en',
  session: { user: testUser },
  user: testUser,
  scope: 'seeded scope',
}

describe('createTestRouter', () => {
  test('runs the lifecycle of the application by default', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText(
        'Real user reads post 1 in en on tab details with 1 unread in real scope',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('App shell')).toBeInTheDocument()
    expect(screen.getByText('Authed layout')).toBeInTheDocument()
    expect(app.calls).toEqual([
      'root.beforeLoad',
      'authed.beforeLoad',
      'post.context',
      'authed.loader',
      'post.loader',
    ])
  })

  test('replaces the options a test names and keeps the rest', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      location: {
        to: '/posts/$postId',
        params: { postId: '2' },
        search: { tab: 'comments' },
      },
      context: { locale: 'de' },
      overrides: {
        [rootRouteId]: { routeContext: { session: { user: testUser } } },
        '/_authed': { loaderData: { unreadCount: 7 } },
        '/_authed/posts/$postId': {
          loader: ({ params }) => ({
            post: { id: params.postId, title: 'Replaced post' },
          }),
        },
      },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText(
        'Test user reads post 2 in de on tab comments with 7 unread in real scope',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Replaced post')
    // The seed for the root route replaced its beforeLoad. The beforeLoad of
    // `/_authed` was not named, so the real one derived the user.
    expect(app.calls).toEqual(['authed.beforeLoad', 'post.context'])
  })

  test('replaces beforeLoad, the context option and components', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      overrides: {
        '/_authed': {
          beforeLoad: ({ context }) => ({
            user: { id: 'derived', name: `Derived in ${context.locale}` },
          }),
          component: () => <Outlet />,
        },
        '/_authed/posts/$postId': {
          context: () => ({ scope: 'test scope' }),
          component: () => {
            const context = app.postRoute.useRouteContext()
            return <p>{`${context.user.name} with ${context.scope}`}</p>
          },
        },
      },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText('Derived in en with test scope'),
    ).toBeInTheDocument()
    expect(screen.getByText('App shell')).toBeInTheDocument()
    expect(screen.queryByText('Authed layout')).not.toBeInTheDocument()
    expect(app.calls).toEqual([
      'root.beforeLoad',
      'authed.loader',
      'post.loader',
    ])
  })

  test('removes an option that is overridden with undefined', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      overrides: { '/_authed': { loader: undefined } },
    })
    await router.load()

    expect(app.calls).not.toContain('authed.loader')
    expect(
      router.state.matches.find((match) => match.routeId === '/_authed')
        ?.loaderData,
    ).toBeUndefined()
  })

  test('keeps overrides out of the route tree and out of the next router', async () => {
    const app = createApp()
    const originalLoader = app.postRoute.options.loader

    const first = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      overrides: {
        '/_authed/posts/$postId': {
          loaderData: { post: { id: '1', title: 'Seeded post' } },
        },
      },
    })
    await first.load()
    expect(first.state.matches.at(-1)?.loaderData).toEqual({
      post: { id: '1', title: 'Seeded post' },
    })
    expect(app.postRoute.options.loader).toBe(originalLoader)

    const second = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
    })
    await second.load()
    expect(second.state.matches.at(-1)?.loaderData).toEqual({
      post: { id: '1', title: 'Real post' },
    })
  })

  test('initialises the route objects that application code imports', () => {
    const app = createApp()
    expect(app.postRoute.id).toBeUndefined()

    createTestRouter({ routeTree: app.routeTree, context: { locale: 'en' } })

    expect(app.postRoute.id).toBe('/_authed/posts/$postId')
    expect(app.postRoute.fullPath).toBe('/posts/$postId')
    expect(app.postRoute.to).toBe('/posts/$postId')
    expect(app.authedRoute.id).toBe('/_authed')
  })

  test('uses a memory history, or the history it is given', async () => {
    const app = createApp()

    const withMemoryHistory = createTestRouter({
      routeTree: app.routeTree,
      context: { locale: 'en' },
    })
    expect(withMemoryHistory.history.location.pathname).toBe('/')
    expect(window.location.pathname).toBe('/')

    const router = createTestRouter({
      routeTree: app.routeTree,
      history: createMemoryHistory({ initialEntries: ['/login'] }),
      context: { locale: 'en' },
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  test('passes the other options to the router', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      context: { locale: 'en' },
      location: { to: '/login' },
      Wrap: ({ children }) => (
        <section aria-label="Providers">{children}</section>
      ),
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText('Providers')).toHaveTextContent(
      'Login page',
    )
  })

  test('lets an override win over the options of a lazy route', async () => {
    const app = createApp()

    const real = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/lazy' },
      context: { locale: 'en' },
    })
    const { unmount } = render(<RouterProvider router={real} />)
    expect(await screen.findByText('Lazy component')).toBeInTheDocument()
    unmount()

    const overridden = createTestRouter({
      routeTree: app.routeTree,
      location: { to: '/lazy' },
      context: { locale: 'en' },
      overrides: { '/lazy': { component: () => <p>Test component</p> } },
    })
    render(<RouterProvider router={overridden} />)
    expect(await screen.findByText('Test component')).toBeInTheDocument()
    expect(screen.queryByText('Lazy component')).not.toBeInTheDocument()
  })

  test('rejects an override for a route that does not exist', () => {
    const app = createApp()

    expect(() =>
      createTestRouter({
        routeTree: app.routeTree,
        context: { locale: 'en' },
        // @ts-expect-error not a route id of this tree
        overrides: { '/missing': { component: () => null } },
      }),
    ).toThrow('The route "/missing" does not exist in the route tree')
  })

  test('rejects conflicting overrides', () => {
    const app = createApp()

    expect(() =>
      createTestRouter({
        routeTree: app.routeTree,
        context: { locale: 'en' },
        overrides: {
          '/_authed': {
            loader: () => ({ unreadCount: 1 }),
            loaderData: { unreadCount: 2 },
          },
        },
      }),
    ).toThrow('has both "loader" and "loaderData"')

    expect(() =>
      createTestRouter({
        routeTree: app.routeTree,
        context: { locale: 'en' },
        overrides: {
          '/_authed': {
            beforeLoad: () => ({ user: testUser }),
            routeContext: { user: testUser },
          },
        },
      }),
    ).toThrow('has both "beforeLoad" and "routeContext"')
  })
})

describe('createIsolatedTestRouter', () => {
  test('renders one element in one route with the state the test supplies', async () => {
    const app = createApp()

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/_authed/posts/$postId',
      element: <app.PostHeader />,
      params: { postId: '5' },
      search: { tab: 'comments' },
      context: seededContext,
      loaderData: {
        '/_authed': { unreadCount: 4 },
        '/_authed/posts/$postId': { post: { id: '5', title: 'Seeded post' } },
      },
    })
    render(<RouterProvider router={router} />)

    // The router has loaded, so the first render is complete.
    expect(screen.getByRole('heading')).toHaveTextContent('Seeded post')
    expect(
      screen.getByText(
        'Test user reads post 5 in en on tab comments with 4 unread in seeded scope',
      ),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/posts/5')

    // Nothing of the application ran or rendered.
    expect(app.calls).toEqual([])
    expect(screen.queryByText('App shell')).not.toBeInTheDocument()
    expect(screen.queryByText('Authed layout')).not.toBeInTheDocument()
    expect(screen.queryByText('Post page')).not.toBeInTheDocument()
  })

  test('sends search params through validateSearch', async () => {
    const app = createApp()
    const state = {
      routeTree: app.routeTree,
      route: '/_authed/posts/$postId',
      params: { postId: '5' },
      context: seededContext,
      loaderData: {
        '/_authed': { unreadCount: 4 },
        '/_authed/posts/$postId': { post: { id: '5', title: 'Seeded post' } },
      },
    } as const

    const router = await createIsolatedTestRouter({
      ...state,
      element: <app.PostHeader />,
    })
    render(<RouterProvider router={router} />)
    expect(screen.getByText(/on tab details/)).toBeInTheDocument()

    await expect(
      createIsolatedTestRouter({
        ...state,
        element: <app.PostHeader />,
        search: { tab: 'broken' },
      }),
    ).rejects.toThrow('Unknown tab')
  })

  test('navigates with the real router and renders no other route', async () => {
    const app = createApp()

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/_authed/posts/$postId',
      element: <app.PostHeader />,
      params: { postId: '5' },
      context: seededContext,
      loaderData: {
        '/_authed': { unreadCount: 4 },
        '/_authed/posts/$postId': { post: { id: '5', title: 'Seeded post' } },
      },
    })
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('link', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(app.calls).toEqual([])
  })

  test('does not load lazy routes', async () => {
    const app = createApp()

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/lazy',
      element: <p>In the lazy route</p>,
      context: { locale: 'en', session: { user: null } },
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByText('In the lazy route')).toBeInTheDocument()
    expect(app.loadLazyRoute).not.toHaveBeenCalled()
  })

  test('passes the other options to the router, except the default components', async () => {
    const app = createApp()

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/login',
      element: <p>Element</p>,
      context: { locale: 'en', session: { user: null } },
      Wrap: ({ children }) => (
        <section aria-label="Providers">{children}</section>
      ),
      defaultComponent: () => <p>Default component</p>,
    })
    render(<RouterProvider router={router} />)

    expect(screen.getByLabelText('Providers')).toHaveTextContent('Element')
    expect(screen.queryByText('Default component')).not.toBeInTheDocument()
  })

  test('renders no not-found component of the app after a navigation', async () => {
    const app = createApp()
    // The router warns that no not-found component is configured.
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/login',
      element: <p>Element</p>,
      context: { locale: 'en', session: { user: null } },
      defaultNotFoundComponent: () => <p>App not found</p>,
    })
    render(<RouterProvider router={router} />)

    router.history.push('/missing')

    expect(await screen.findByText('Not Found')).toBeInTheDocument()
    expect(screen.queryByText('App not found')).not.toBeInTheDocument()
    consoleWarn.mockRestore()
  })

  test('lets an error of the element reach the test', async () => {
    const app = createApp()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never {
      throw new Error('The element is broken')
    }

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/login',
      element: <Broken />,
      context: { locale: 'en', session: { user: null } },
    })

    expect(() => render(<RouterProvider router={router} />)).toThrow(
      'The element is broken',
    )
    consoleError.mockRestore()
  })

  test('fails when a path param is missing', async () => {
    const app = createApp()

    await expect(
      createIsolatedTestRouter({
        routeTree: app.routeTree,
        route: '/_authed/posts/$postId',
        element: <app.PostHeader />,
        // @ts-expect-error `postId` is missing
        params: {},
        context: seededContext,
        loaderData: {
          '/_authed': { unreadCount: 4 },
          '/_authed/posts/$postId': {
            post: { id: '5', title: 'Seeded post' },
          },
        },
      }),
    ).rejects.toThrow(
      'Missing path params for route "/_authed/posts/$postId": postId.',
    )
  })

  test('fails when the path of the route does not lead to it', async () => {
    const app = createApp()

    await expect(
      createIsolatedTestRouter({
        routeTree: app.routeTree,
        route: '/_authed',
        element: <p>Element</p>,
        context: { locale: 'en', session: { user: testUser }, user: testUser },
        loaderData: { '/_authed': { unreadCount: 4 } },
      }),
    ).rejects.toThrow('The route "/_authed" is not matched at "/"')
  })

  test('fails for a route that does not exist', async () => {
    const app = createApp()

    await expect(
      createIsolatedTestRouter({
        routeTree: app.routeTree,
        // @ts-expect-error not a route id of this tree
        route: '/missing',
        element: <p>Element</p>,
      }),
    ).rejects.toThrow('The route "/missing" does not exist in the route tree')
  })
})
