import { describe, expectTypeOf, test } from 'vitest'
import { createRootRouteWithContext, createRoute, rootRouteId } from '../src'
import { createIsolatedTestRouter, createTestRouter } from '../src/testing'
import type { Router, SearchSchemaInput } from '../src'
import type { IsolatedRouteState, RouteTestOverrides } from '../src/testing'

interface User {
  id: string
}

interface Session {
  user: User | null
}

const rootRoute = createRootRouteWithContext<{ locale: string }>()({
  beforeLoad: (): { session: Session } => ({ session: { user: null } }),
})

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: ({ context }) => ({ user: context.session.user as User }),
  loader: () => ({ unreadCount: 1 }),
})

const postRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/posts/$postId',
  validateSearch: (search: { tab?: string } & SearchSchemaInput) => ({
    tab: search.tab ?? 'details',
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ params }) => ({ post: { id: params.postId } }),
})

const settingsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/settings',
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: () => {
    // A guard that adds nothing to the context.
  },
})

const routeTree = rootRoute.addChildren([
  authedRoute.addChildren([postRoute, settingsRoute]),
  loginRoute,
])

type RouteTree = typeof routeTree

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]

const postState = {
  routeTree,
  route: '/_authed/posts/$postId',
  element: <div />,
  params: { postId: '1' },
  context: { locale: 'en', session: { user: null }, user: { id: '1' } },
  loaderData: {
    '/_authed': { unreadCount: 1 },
    '/_authed/posts/$postId': { post: { id: '1' } },
  },
} as const

describe('createIsolatedTestRouter', () => {
  test('asks for everything the route promises to its components', () => {
    type PostState = IsolatedRouteState<RouteTree, '/_authed/posts/$postId'>

    expectTypeOf<RequiredKeys<PostState>>().toEqualTypeOf<
      'route' | 'params' | 'context' | 'loaderData'
    >()
    expectTypeOf<PostState['route']>().toEqualTypeOf<'/_authed/posts/$postId'>()
    expectTypeOf<keyof PostState['params']>().toEqualTypeOf<'postId'>()
    expectTypeOf<PostState['params']['postId']>().toEqualTypeOf<string>()
    expectTypeOf<keyof PostState['context']>().toEqualTypeOf<
      'locale' | 'session' | 'user'
    >()
    expectTypeOf<PostState['context']['session']>().toEqualTypeOf<Session>()
    expectTypeOf<PostState['context']['user']>().toEqualTypeOf<User>()
    expectTypeOf<RequiredKeys<PostState['loaderData']>>().toEqualTypeOf<
      '/_authed' | '/_authed/posts/$postId'
    >()
    expectTypeOf<PostState['loaderData']['/_authed']>().toEqualTypeOf<{
      unreadCount: number
    }>()
    expectTypeOf<
      PostState['loaderData']['/_authed/posts/$postId']
    >().toEqualTypeOf<{ post: { id: string } }>()
    expectTypeOf<NonNullable<PostState['search']>>().toEqualTypeOf<{
      tab?: string
    }>()
  })

  test('asks for nothing a route does not have', () => {
    type SettingsState = IsolatedRouteState<RouteTree, '/_authed/settings'>
    // No path params and no loader of its own, but an ancestor with a loader.
    expectTypeOf<RequiredKeys<SettingsState>>().toEqualTypeOf<
      'route' | 'context' | 'loaderData'
    >()
    expectTypeOf<
      RequiredKeys<SettingsState['loaderData']>
    >().toEqualTypeOf<'/_authed'>()

    type LoginState = IsolatedRouteState<RouteTree, '/login'>
    // Its beforeLoad adds nothing, so the context is the one of the root route.
    expectTypeOf<RequiredKeys<LoginState>>().toEqualTypeOf<
      'route' | 'context'
    >()
    expectTypeOf<keyof LoginState['context']>().toEqualTypeOf<
      'locale' | 'session'
    >()
    const _loginState: LoginState = {
      // @ts-expect-error the state of `/login` cannot name another route
      route: '/_authed/posts/$postId',
      context: { locale: 'en', session: { user: null } },
    }
  })

  test('accepts the complete state and resolves to the router type', () => {
    expectTypeOf(createIsolatedTestRouter(postState)).toEqualTypeOf<
      Promise<Router<RouteTree, 'never', false>>
    >()
  })

  test('rejects state that is incomplete or of the wrong type', () => {
    const { context: _context, ...withoutContext } = postState
    // @ts-expect-error the context of the route is missing
    void createIsolatedTestRouter(withoutContext)

    const withoutUser = {
      ...postState,
      context: { locale: 'en', session: { user: null } },
    } as const
    // @ts-expect-error `user` is missing from the context
    void createIsolatedTestRouter(withoutUser)

    const withoutRouteLoaderData = {
      ...postState,
      loaderData: { '/_authed': { unreadCount: 1 } },
    } as const
    // @ts-expect-error the loader data of the route is missing
    void createIsolatedTestRouter(withoutRouteLoaderData)

    const withoutAncestorLoaderData = {
      ...postState,
      loaderData: { '/_authed/posts/$postId': { post: { id: '1' } } },
    } as const
    // @ts-expect-error the loader data of `/_authed` is missing
    void createIsolatedTestRouter(withoutAncestorLoaderData)

    const { params: _params, ...withoutParams } = postState
    // @ts-expect-error the path params are missing
    void createIsolatedTestRouter(withoutParams)

    const wrongLoaderData = {
      ...postState,
      loaderData: {
        '/_authed': { unreadCount: 1 },
        '/_authed/posts/$postId': { post: 1 },
      },
    } as const
    // @ts-expect-error `post` is not a number
    void createIsolatedTestRouter(wrongLoaderData)

    const unknownRoute = { ...postState, route: '/unknown' } as const
    // @ts-expect-error not a route id of the tree
    void createIsolatedTestRouter(unknownRoute)
  })

  test('takes the root route by rootRouteId', () => {
    type RootState = IsolatedRouteState<RouteTree, typeof rootRouteId>
    expectTypeOf<RequiredKeys<RootState>>().toEqualTypeOf<'route' | 'context'>()

    void createIsolatedTestRouter({
      routeTree,
      route: rootRouteId,
      element: <div />,
      context: { locale: 'en', session: { user: null } },
    })
  })
})

describe('createTestRouter', () => {
  test('returns the router type of the route tree', () => {
    expectTypeOf(
      createTestRouter({ routeTree, context: { locale: 'en' } }),
    ).toEqualTypeOf<Router<RouteTree, 'never', false>>()
  })

  test('requires the router context like createRouter', () => {
    const withoutContext = { routeTree } as const
    // @ts-expect-error the router context is required
    createTestRouter(withoutContext)
  })

  test('types the location like navigation options', () => {
    createTestRouter({
      routeTree,
      context: { locale: 'en' },
      location: {
        to: '/posts/$postId',
        params: { postId: '1' },
        search: { tab: 'comments' },
      },
    })

    const withoutParams = {
      routeTree,
      context: { locale: 'en' },
      location: { to: '/posts/$postId' },
    } as const
    // @ts-expect-error the path params of the location are missing
    createTestRouter(withoutParams)

    const unknownPath = {
      routeTree,
      context: { locale: 'en' },
      location: { to: '/unknown' },
    } as const
    // @ts-expect-error not a path of the tree
    createTestRouter(unknownPath)
  })

  test('types replacements and seeds from the route', () => {
    createTestRouter({
      routeTree,
      context: { locale: 'en' },
      overrides: {
        [rootRouteId]: {
          beforeLoad: ({ context }) => {
            expectTypeOf(context.locale).toEqualTypeOf<string>()
            return { session: { user: null } }
          },
        },
        '/_authed': {
          beforeLoad: ({ context }) => {
            expectTypeOf(context.locale).toEqualTypeOf<string>()
            expectTypeOf(context.session).toEqualTypeOf<Session>()
            return { user: { id: '1' } }
          },
          loaderData: { unreadCount: 2 },
        },
        '/_authed/posts/$postId': {
          loader: ({ params, context, deps }) => {
            expectTypeOf(params).toEqualTypeOf<{ postId: string }>()
            expectTypeOf(context.user).toEqualTypeOf<User>()
            expectTypeOf(deps).toEqualTypeOf<{ tab: string }>()
            return { post: { id: params.postId } }
          },
          component: () => <div />,
        },
        '/login': {
          beforeLoad: () => {},
        },
      },
    })

    createTestRouter({
      routeTree,
      context: { locale: 'en' },
      overrides: {
        [rootRouteId]: { routeContext: { session: { user: { id: '1' } } } },
      },
    })
  })

  test('checks a shared override object with RouteTestOverrides', () => {
    const signedIn = {
      [rootRouteId]: { routeContext: { session: { user: { id: '1' } } } },
    } satisfies RouteTestOverrides<RouteTree>

    createTestRouter({
      routeTree,
      context: { locale: 'en' },
      overrides: signedIn,
    })
  })

  test('rejects replacements and seeds of the wrong type', () => {
    const wrongSeed = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/_authed': { loaderData: { unreadCount: 'many' } } },
    } as const
    // @ts-expect-error `unreadCount` is a number
    createTestRouter(wrongSeed)

    const wrongContextSeed = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/_authed': { routeContext: { user: 'nobody' } } },
    } as const
    // @ts-expect-error `user` is an object
    createTestRouter(wrongContextSeed)

    const contextValue = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/_authed': { context: { user: { id: '1' } } } },
    } as const
    // @ts-expect-error `context` replaces the route option and takes a function
    createTestRouter(contextValue)

    const wrongLoader = {
      routeTree,
      context: { locale: 'en' },
      overrides: {
        '/_authed/posts/$postId': { loader: () => ({ post: 'none' }) },
      },
    }
    // @ts-expect-error the loader has to return the loader data of the route
    createTestRouter(wrongLoader)

    const wrongBeforeLoad = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/_authed': { beforeLoad: () => ({ user: 'nobody' }) } },
    }
    // @ts-expect-error beforeLoad has to return what the route's own returns
    createTestRouter(wrongBeforeLoad)

    const unknownRoute = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/unknown': {} },
    } as const
    // @ts-expect-error not a route id of the tree
    createTestRouter(unknownRoute)
  })
})
