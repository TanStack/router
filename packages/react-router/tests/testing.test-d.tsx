import { render } from '@testing-library/react'
import { describe, expectTypeOf, test } from 'vitest'
import { createRootRouteWithContext, createRoute } from '../src'
import { createRouterTesting } from '../src/testing'
import type * as React from 'react'
import type { RenderResult } from '@testing-library/react'
import type { Router, SearchSchemaInput } from '../src'
import type { RenderInRouteOptions } from '../src/testing'

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

const testing = createRouterTesting({ routeTree, render })

const testingWithDefaults = createRouterTesting({
  routeTree,
  render,
  defaults: {
    context: { locale: 'en', user: { id: 'default' } },
    routes: { '/_authed': { loaderData: { unreadCount: 0 } } },
  },
})

const postState = {
  route: '/_authed/posts/$postId',
  params: { postId: '1' },
  context: { locale: 'en', session: { user: null }, user: { id: '1' } },
  loaderData: { post: { id: '1' } },
  routes: { '/_authed': { loaderData: { unreadCount: 1 } } },
} as const

describe('renderInRoute', () => {
  test('asks for everything the route promises to its components', () => {
    type PostOptions = RenderInRouteOptions<
      RouteTree,
      '/_authed/posts/$postId',
      {}
    >

    expectTypeOf<RequiredKeys<PostOptions>>().toEqualTypeOf<
      'route' | 'params' | 'context' | 'loaderData' | 'routes'
    >()
    expectTypeOf<
      PostOptions['route']
    >().toEqualTypeOf<'/_authed/posts/$postId'>()
    expectTypeOf<keyof PostOptions['params']>().toEqualTypeOf<'postId'>()
    expectTypeOf<PostOptions['params']['postId']>().toEqualTypeOf<string>()
    expectTypeOf<keyof PostOptions['context']>().toEqualTypeOf<
      'locale' | 'session' | 'user'
    >()
    expectTypeOf<PostOptions['context']['locale']>().toEqualTypeOf<string>()
    expectTypeOf<PostOptions['context']['session']>().toEqualTypeOf<Session>()
    expectTypeOf<PostOptions['context']['user']>().toEqualTypeOf<User>()
    expectTypeOf<PostOptions['loaderData']>().toEqualTypeOf<{
      post: { id: string }
    }>()
    expectTypeOf<PostOptions['routes']['/_authed']>().toEqualTypeOf<{
      loaderData: { unreadCount: number }
    }>()
    expectTypeOf<NonNullable<PostOptions['search']>>().toEqualTypeOf<{
      tab?: string
    }>()
  })

  test('asks for nothing a route does not have', () => {
    type SettingsOptions = RenderInRouteOptions<
      RouteTree,
      '/_authed/settings',
      {}
    >
    // No path params and no loader of its own, but an ancestor with a loader.
    expectTypeOf<RequiredKeys<SettingsOptions>>().toEqualTypeOf<
      'route' | 'context' | 'routes'
    >()

    type LoginOptions = RenderInRouteOptions<RouteTree, '/login', {}>
    // Its beforeLoad adds nothing, so the context is the one of the root route.
    expectTypeOf<RequiredKeys<LoginOptions>>().toEqualTypeOf<
      'route' | 'context'
    >()
    expectTypeOf<keyof LoginOptions['context']>().toEqualTypeOf<
      'locale' | 'session'
    >()
  })

  test('accepts the complete state and returns the router and the render result', async () => {
    const rendered = await testing.renderInRoute(<div />, postState)

    expectTypeOf(rendered.router).toEqualTypeOf<
      Router<RouteTree, 'never', false>
    >()
    expectTypeOf(rendered.result).toEqualTypeOf<RenderResult>()
  })

  test('rejects state that is incomplete or of the wrong type', () => {
    const { context: _context, ...withoutContext } = postState
    // @ts-expect-error the context of the route is missing
    void testing.renderInRoute(<div />, withoutContext)

    const withoutUser = {
      ...postState,
      context: { locale: 'en', session: { user: null } },
    } as const
    // @ts-expect-error `user` is missing from the context
    void testing.renderInRoute(<div />, withoutUser)

    const { loaderData: _loaderData, ...withoutLoaderData } = postState
    // @ts-expect-error the loader data of the route is missing
    void testing.renderInRoute(<div />, withoutLoaderData)

    const { routes: _routes, ...withoutAncestors } = postState
    // @ts-expect-error the loader data of `/_authed` is missing
    void testing.renderInRoute(<div />, withoutAncestors)

    const { params: _params, ...withoutParams } = postState
    // @ts-expect-error the path params are missing
    void testing.renderInRoute(<div />, withoutParams)

    const wrongLoaderData = { ...postState, loaderData: { post: 1 } } as const
    // @ts-expect-error `post` is not a number
    void testing.renderInRoute(<div />, wrongLoaderData)

    const unknownRoute = { ...postState, route: '/unknown' } as const
    // @ts-expect-error not a route id of the tree
    void testing.renderInRoute(<div />, unknownRoute)
  })

  test('makes optional what the defaults of the application provide', () => {
    const { routes: _routes, ...withoutAncestors } = postState
    const withDefaults = {
      ...withoutAncestors,
      context: { session: { user: null } },
    } as const
    void testingWithDefaults.renderInRoute(<div />, withDefaults)

    const withoutSession = { ...withoutAncestors, context: {} } as const
    // @ts-expect-error `session` is not among the defaults
    void testingWithDefaults.renderInRoute(<div />, withoutSession)

    type PostOptions = RenderInRouteOptions<
      RouteTree,
      '/_authed/posts/$postId',
      {
        context: { locale: string; user: User }
        routes: { '/_authed': { loaderData: { unreadCount: number } } }
      }
    >
    expectTypeOf<RequiredKeys<PostOptions>>().toEqualTypeOf<
      'route' | 'params' | 'context' | 'loaderData'
    >()
    expectTypeOf<
      RequiredKeys<PostOptions['context']>
    >().toEqualTypeOf<'session'>()
  })
})

describe('createRouterTesting', () => {
  test('types the defaults from the route tree', () => {
    createRouterTesting({
      routeTree,
      defaults: {
        context: { locale: 'en', session: { user: null } },
        routes: {
          '/_authed': {
            beforeLoad: ({ context }) => {
              expectTypeOf(context.session).toEqualTypeOf<Session>()
              return { user: { id: '1' } }
            },
          },
        },
      },
    })

    createRouterTesting({
      routeTree,
      // @ts-expect-error `locale` is a string
      defaults: { context: { locale: 1 } },
    })
  })

  test('takes the type of the render result from the render function', async () => {
    const withAsyncRender = createRouterTesting({
      routeTree,
      render: (ui: React.ReactElement) => Promise.resolve({ ui }),
    })
    const rendered = await withAsyncRender.renderInRoute(<div />, postState)

    expectTypeOf(rendered.result).toEqualTypeOf<{ ui: React.ReactElement }>()
  })
})

describe('createTestRouter', () => {
  test('returns the router type of the route tree', () => {
    expectTypeOf(
      testing.createTestRouter({ context: { locale: 'en' } }),
    ).toEqualTypeOf<Router<RouteTree, 'never', false>>()
  })

  test('requires the router context unless the defaults provide it', () => {
    // @ts-expect-error the router context is required
    testing.createTestRouter()

    const withoutContext = {} as const
    // @ts-expect-error the router context is required
    testing.createTestRouter(withoutContext)

    testingWithDefaults.createTestRouter()
  })

  test('types the location like navigation options', () => {
    testing.createTestRouter({
      context: { locale: 'en' },
      location: {
        to: '/posts/$postId',
        params: { postId: '1' },
        search: { tab: 'comments' },
      },
    })

    const withoutParams = {
      context: { locale: 'en' },
      location: { to: '/posts/$postId' },
    } as const
    // @ts-expect-error the path params of the location are missing
    testing.createTestRouter(withoutParams)

    const unknownPath = {
      context: { locale: 'en' },
      location: { to: '/unknown' },
    } as const
    // @ts-expect-error not a path of the tree
    testing.createTestRouter(unknownPath)
  })

  test('types replacements and seeds from the route', () => {
    testing.createTestRouter({
      context: { locale: 'en' },
      routes: {
        __root__: { context: { session: { user: null } } },
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
  })

  test('rejects replacements and seeds of the wrong type', () => {
    const wrongSeed = {
      context: { locale: 'en' },
      routes: { '/_authed': { loaderData: { unreadCount: 'many' } } },
    } as const
    // @ts-expect-error `unreadCount` is a number
    testing.createTestRouter(wrongSeed)

    const wrongContextSeed = {
      context: { locale: 'en' },
      routes: { '/_authed': { context: { user: 'nobody' } } },
    } as const
    // @ts-expect-error `user` is an object
    testing.createTestRouter(wrongContextSeed)

    const wrongLoader = {
      context: { locale: 'en' },
      routes: {
        '/_authed/posts/$postId': { loader: () => ({ post: 'none' }) },
      },
    }
    // @ts-expect-error the loader has to return the loader data of the route
    testing.createTestRouter(wrongLoader)

    const wrongBeforeLoad = {
      context: { locale: 'en' },
      routes: { '/_authed': { beforeLoad: () => ({ user: 'nobody' }) } },
    }
    // @ts-expect-error beforeLoad has to return what the route's own returns
    testing.createTestRouter(wrongBeforeLoad)

    const unknownRoute = {
      context: { locale: 'en' },
      routes: { '/unknown': {} },
    } as const
    // @ts-expect-error not a route id of the tree
    testing.createTestRouter(unknownRoute)
  })
})
