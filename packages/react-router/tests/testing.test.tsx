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
} from '../src'
import { createRouterTesting } from '../src/testing'
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

describe('createTestRouter', () => {
  test('runs the lifecycle of the application by default', async () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const router = createTestRouter({
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
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const router = createTestRouter({
      location: {
        to: '/posts/$postId',
        params: { postId: '2' },
        search: { tab: 'comments' },
      },
      context: { locale: 'de' },
      routes: {
        __root__: { context: { session: { user: testUser } } },
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
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const router = createTestRouter({
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      routes: {
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
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const router = createTestRouter({
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      routes: { '/_authed': { loader: undefined } },
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
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const first = createTestRouter({
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'en' },
      routes: {
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

    createRouterTesting({ routeTree: app.routeTree }).createTestRouter({
      context: { locale: 'en' },
    })

    expect(app.postRoute.id).toBe('/_authed/posts/$postId')
    expect(app.postRoute.fullPath).toBe('/posts/$postId')
    expect(app.postRoute.to).toBe('/posts/$postId')
    expect(app.authedRoute.id).toBe('/_authed')
  })

  test('starts from a history instead of a location', async () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const router = createTestRouter({
      history: createMemoryHistory({ initialEntries: ['/login'] }),
      context: { locale: 'en' },
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  test('lets an override win over the options of a lazy route', async () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    const real = createTestRouter({
      location: { to: '/lazy' },
      context: { locale: 'en' },
    })
    const { unmount } = render(<RouterProvider router={real} />)
    expect(await screen.findByText('Lazy component')).toBeInTheDocument()
    unmount()

    const overridden = createTestRouter({
      location: { to: '/lazy' },
      context: { locale: 'en' },
      routes: { '/lazy': { component: () => <p>Test component</p> } },
    })
    render(<RouterProvider router={overridden} />)
    expect(await screen.findByText('Test component')).toBeInTheDocument()
    expect(screen.queryByText('Lazy component')).not.toBeInTheDocument()
  })

  test('applies the defaults of the application, and a test wins over them', async () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
      defaults: {
        context: { locale: 'fr' },
        routes: {
          __root__: { context: { session: { user: testUser } } },
          '/_authed': { loaderData: { unreadCount: 3 } },
        },
      },
    })

    const withDefaults = createTestRouter({
      location: { to: '/posts/$postId', params: { postId: '1' } },
    })
    const { unmount } = render(<RouterProvider router={withDefaults} />)
    expect(
      await screen.findByText(
        'Test user reads post 1 in fr on tab details with 3 unread in real scope',
      ),
    ).toBeInTheDocument()
    unmount()

    const withOwnValues = createTestRouter({
      location: { to: '/posts/$postId', params: { postId: '1' } },
      context: { locale: 'it' },
      routes: { '/_authed': { loaderData: { unreadCount: 9 } } },
    })
    render(<RouterProvider router={withOwnValues} />)
    expect(
      await screen.findByText(
        'Test user reads post 1 in it on tab details with 9 unread in real scope',
      ),
    ).toBeInTheDocument()
  })

  test('rejects an override for a route that does not exist', () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    expect(() =>
      createTestRouter({
        context: { locale: 'en' },
        // @ts-expect-error not a route id of this tree
        routes: { '/missing': { component: () => null } },
      }),
    ).toThrow('The route "/missing" does not exist in the route tree')
  })

  test('rejects an override with both a loader and loader data', () => {
    const app = createApp()
    const { createTestRouter } = createRouterTesting({
      routeTree: app.routeTree,
    })

    expect(() =>
      createTestRouter({
        context: { locale: 'en' },
        routes: {
          '/_authed': {
            loader: () => ({ unreadCount: 1 }),
            loaderData: { unreadCount: 2 },
          },
        },
      }),
    ).toThrow('has both "loader" and "loaderData"')
  })
})

describe('renderInRoute', () => {
  test('renders one element in one route with the state the test supplies', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    const { router } = await renderInRoute(<app.PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: '5' },
      search: { tab: 'comments' },
      context: {
        locale: 'en',
        session: { user: testUser },
        user: testUser,
        scope: 'seeded scope',
      },
      loaderData: { post: { id: '5', title: 'Seeded post' } },
      routes: { '/_authed': { loaderData: { unreadCount: 4 } } },
    })

    // The first render is complete: nothing is pending.
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
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })
    const state = {
      route: '/_authed/posts/$postId',
      params: { postId: '5' },
      context: {
        locale: 'en',
        session: { user: testUser },
        user: testUser,
        scope: 'seeded scope',
      },
      loaderData: { post: { id: '5', title: 'Seeded post' } },
      routes: { '/_authed': { loaderData: { unreadCount: 4 } } },
    } as const

    await renderInRoute(<app.PostHeader />, state)
    expect(screen.getByText(/on tab details/)).toBeInTheDocument()
    cleanup()

    await expect(
      renderInRoute(<app.PostHeader />, {
        ...state,
        search: { tab: 'broken' },
      }),
    ).rejects.toThrow('Unknown tab')
  })

  test('takes context and loader data from the defaults of the application', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
      defaults: {
        context: {
          locale: 'en',
          session: { user: testUser },
          user: testUser,
          scope: 'default scope',
        },
        routes: { '/_authed': { loaderData: { unreadCount: 2 } } },
      },
    })

    await renderInRoute(<app.PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: '5' },
      context: { user: realUser },
      loaderData: { post: { id: '5', title: 'Seeded post' } },
    })

    expect(
      screen.getByText(
        'Real user reads post 5 in en on tab details with 2 unread in default scope',
      ),
    ).toBeInTheDocument()
    expect(app.calls).toEqual([])
  })

  test('navigates with the real router and renders no other route', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    const { router } = await renderInRoute(<app.PostHeader />, {
      route: '/_authed/posts/$postId',
      params: { postId: '5' },
      context: {
        locale: 'en',
        session: { user: testUser },
        user: testUser,
        scope: 'seeded scope',
      },
      loaderData: { post: { id: '5', title: 'Seeded post' } },
      routes: { '/_authed': { loaderData: { unreadCount: 4 } } },
    })

    fireEvent.click(screen.getByRole('link', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(app.calls).toEqual([])
  })

  test('does not load lazy routes', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    await renderInRoute(<p>In the lazy route</p>, {
      route: '/lazy',
      context: { locale: 'en', session: { user: null } },
    })

    expect(screen.getByText('In the lazy route')).toBeInTheDocument()
    expect(app.loadLazyRoute).not.toHaveBeenCalled()
  })

  test('applies the router options of the application, such as Wrap', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
      routerOptions: {
        Wrap: ({ children }) => (
          <section aria-label="Providers">{children}</section>
        ),
        defaultComponent: () => <p>Default component</p>,
      },
    })

    await renderInRoute(<p>Element</p>, {
      route: '/login',
      context: { locale: 'en', session: { user: null } },
    })

    expect(screen.getByLabelText('Providers')).toHaveTextContent('Element')
    expect(screen.queryByText('Default component')).not.toBeInTheDocument()
  })

  test('lets an error of the element reach the test', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never {
      throw new Error('The element is broken')
    }

    await expect(
      renderInRoute(<Broken />, {
        route: '/login',
        context: { locale: 'en', session: { user: null } },
      }),
    ).rejects.toThrow('The element is broken')

    consoleError.mockRestore()
  })

  test('fails when a path param is missing', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    await expect(
      renderInRoute(<app.PostHeader />, {
        route: '/_authed/posts/$postId',
        // @ts-expect-error `postId` is missing
        params: {},
        context: {
          locale: 'en',
          session: { user: testUser },
          user: testUser,
          scope: 'seeded scope',
        },
        loaderData: { post: { id: '5', title: 'Seeded post' } },
        routes: { '/_authed': { loaderData: { unreadCount: 4 } } },
      }),
    ).rejects.toThrow(
      'Missing path params for route "/_authed/posts/$postId": postId.',
    )
  })

  test('fails when the path of the route does not lead to it', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    await expect(
      renderInRoute(<p>Element</p>, {
        route: '/_authed',
        context: {
          locale: 'en',
          session: { user: testUser },
          user: testUser,
        },
        loaderData: { unreadCount: 4 },
      }),
    ).rejects.toThrow('The route "/_authed" is not matched at "/"')
  })

  test('fails for a route that does not exist', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
      render,
    })

    await expect(
      renderInRoute(<p>Element</p>, {
        // @ts-expect-error not a route id of this tree
        route: '/missing',
      }),
    ).rejects.toThrow('The route "/missing" does not exist in the route tree')
  })

  test('needs a render function', async () => {
    const app = createApp()
    const { renderInRoute } = createRouterTesting({
      routeTree: app.routeTree,
    })

    await expect(
      renderInRoute(<p>Element</p>, {
        route: '/login',
        context: { locale: 'en', session: { user: null } },
      }),
    ).rejects.toThrow('renderInRoute needs a render function')
  })
})
