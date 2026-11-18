import { afterEach, describe, expect, test } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { defineComponent } from 'vue'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  redirect,
  rootRouteId,
} from '../src'
import { createIsolatedTestRouter, createTestRouter } from '../src/testing'

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

const realUser: User = { id: 'real', name: 'Real user' }
const testUser: User = { id: 'test', name: 'Test user' }

function createApp() {
  const calls: Array<string> = []

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
    loader: ({ params }) => {
      calls.push('post.loader')
      return { post: { id: params.postId, title: 'Real post' } }
    },
    component: () => <PostHeader />,
  })

  // Reads the state of its own route and of an ancestor through the route
  // objects, the way components in route files do.
  const PostHeader = defineComponent({
    setup() {
      const data = postRoute.useLoaderData()
      const context = postRoute.useRouteContext()
      const authedData = authedRoute.useLoaderData()

      return () => (
        <header>
          <h1>{data.value.post.title}</h1>
          <p>
            {`${context.value.user.name} reads post ${data.value.post.id} in ${context.value.locale} with ${authedData.value.unreadCount} unread`}
          </p>
          <Link to="/login">Sign out</Link>
        </header>
      )
    },
  })

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <p>Login page</p>,
  })

  const routeTree = rootRoute.addChildren([
    authedRoute.addChildren([postRoute]),
    loginRoute,
  ])

  return { routeTree, PostHeader, calls }
}

describe('createTestRouter', () => {
  test('runs the lifecycle of the application by default', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      context: { locale: 'en' },
      location: { to: '/posts/$postId', params: { postId: '1' } },
    })
    render(<RouterProvider router={router} />)

    expect(
      await screen.findByText('Real user reads post 1 in en with 1 unread'),
    ).toBeInTheDocument()
    expect(screen.getByText('App shell')).toBeInTheDocument()
    expect(app.calls).toEqual([
      'root.beforeLoad',
      'authed.beforeLoad',
      'authed.loader',
      'post.loader',
    ])
  })

  test('replaces the options a test names and keeps the rest', async () => {
    const app = createApp()

    const router = createTestRouter({
      routeTree: app.routeTree,
      context: { locale: 'de' },
      location: { to: '/posts/$postId', params: { postId: '2' } },
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
      await screen.findByText('Test user reads post 2 in de with 7 unread'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('Replaced post')
    expect(app.calls).toEqual(['authed.beforeLoad'])
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
      context: { locale: 'en', session: { user: testUser }, user: testUser },
      loaderData: {
        '/_authed': { unreadCount: 4 },
        '/_authed/posts/$postId': { post: { id: '5', title: 'Seeded post' } },
      },
    })
    render(<RouterProvider router={router} />)

    // The router has loaded, so the first render is complete.
    expect(await screen.findByRole('heading')).toHaveTextContent('Seeded post')
    expect(
      screen.getByText('Test user reads post 5 in en with 4 unread'),
    ).toBeInTheDocument()
    expect(app.calls).toEqual([])
    expect(screen.queryByText('App shell')).not.toBeInTheDocument()
    expect(screen.queryByText('Authed layout')).not.toBeInTheDocument()
  })

  test('navigates with the real router and renders no other route', async () => {
    const app = createApp()

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/_authed/posts/$postId',
      element: <app.PostHeader />,
      params: { postId: '5' },
      context: { locale: 'en', session: { user: testUser }, user: testUser },
      loaderData: {
        '/_authed': { unreadCount: 4 },
        '/_authed/posts/$postId': { post: { id: '5', title: 'Seeded post' } },
      },
    })
    render(<RouterProvider router={router} />)

    await fireEvent.click(await screen.findByRole('link', { name: 'Sign out' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(app.calls).toEqual([])
  })

  test('passes the other options to the router', async () => {
    const app = createApp()
    const Providers = defineComponent({
      setup(_, { slots }) {
        return () => (
          <section aria-label="Providers">{slots.default?.()}</section>
        )
      },
    })

    const router = await createIsolatedTestRouter({
      routeTree: app.routeTree,
      route: '/login',
      element: <p>Element</p>,
      context: { locale: 'en', session: { user: null } },
      // Vue renders `Wrap` with a default slot, as in RouterProvider.test.tsx.
      Wrap: Providers as any,
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText('Providers')).toHaveTextContent(
      'Element',
    )
  })
})
