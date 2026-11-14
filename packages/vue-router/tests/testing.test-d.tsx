import { describe, expectTypeOf, test } from 'vitest'
import { createRootRouteWithContext, createRoute, rootRouteId } from '../src'
import { createIsolatedTestRouter, createTestRouter } from '../src/testing'
import type { Router } from '../src'
import type { IsolatedRouteState } from '../src/testing'

interface User {
  id: string
}

const rootRoute = createRootRouteWithContext<{ locale: string }>()({
  beforeLoad: (): { session: { user: User | null } } => ({
    session: { user: null },
  }),
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
  loader: ({ params }) => ({ post: { id: params.postId } }),
})

const routeTree = rootRoute.addChildren([authedRoute.addChildren([postRoute])])

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
    expectTypeOf<RequiredKeys<PostState['loaderData']>>().toEqualTypeOf<
      '/_authed' | '/_authed/posts/$postId'
    >()
  })

  test('resolves to the Vue router type', () => {
    expectTypeOf(createIsolatedTestRouter(postState)).toEqualTypeOf<
      Promise<Router<RouteTree, 'never', false>>
    >()
  })

  test('rejects state that is incomplete', () => {
    const withoutAncestorLoaderData = {
      ...postState,
      loaderData: { '/_authed/posts/$postId': { post: { id: '1' } } },
    } as const
    // @ts-expect-error the loader data of `/_authed` is missing
    void createIsolatedTestRouter(withoutAncestorLoaderData)
  })
})

describe('createTestRouter', () => {
  test('returns the Vue router type and types the overrides', () => {
    expectTypeOf(
      createTestRouter({
        routeTree,
        context: { locale: 'en' },
        location: { to: '/posts/$postId', params: { postId: '1' } },
        overrides: {
          [rootRouteId]: { routeContext: { session: { user: { id: '1' } } } },
          '/_authed/posts/$postId': {
            loader: ({ params }) => ({ post: { id: params.postId } }),
          },
        },
      }),
    ).toEqualTypeOf<Router<RouteTree, 'never', false>>()

    const wrongSeed = {
      routeTree,
      context: { locale: 'en' },
      overrides: { '/_authed': { loaderData: { unreadCount: 'many' } } },
    } as const
    // @ts-expect-error `unreadCount` is a number
    createTestRouter(wrongSeed)
  })
})
