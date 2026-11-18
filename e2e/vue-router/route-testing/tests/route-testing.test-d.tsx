import { rootRouteId } from '@tanstack/vue-router'
import {
  createIsolatedTestRouter,
  createTestRouter,
} from '@tanstack/vue-router/testing'
import { describe, expectTypeOf, test } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import { routeTree } from '../src/routeTree.gen'
import { createPost, signedInContext, testUser } from '../src/test-fixtures'
import type { Post, Session, User } from '../src/api'

const postState = {
  routeTree,
  route: '/_authed/posts/$postId',
  element: <PostHeader />,
  params: { postId: 'post-1' },
  context: signedInContext,
  loaderData: {
    '/_authed': { unreadCount: 0 },
    '/_authed/posts/$postId': { post: createPost() },
  },
} as const

describe('createIsolatedTestRouter is typed from the generated route tree', () => {
  test('accepts the complete state of a route', () => {
    void createIsolatedTestRouter(postState)
  })

  test('rejects a missing context value', () => {
    const withoutUser = {
      ...postState,
      context: { locale: 'en', session: { user: testUser } },
    } as const
    // @ts-expect-error `user` comes from the beforeLoad of `/_authed` and is missing
    void createIsolatedTestRouter(withoutUser)
  })

  test('rejects missing loader data of the route and of its ancestors', () => {
    const withoutRouteData = {
      ...postState,
      loaderData: { '/_authed': { unreadCount: 0 } },
    } as const
    // @ts-expect-error the loader data of the route is missing
    void createIsolatedTestRouter(withoutRouteData)

    const withoutAncestorData = {
      ...postState,
      loaderData: { '/_authed/posts/$postId': { post: createPost() } },
    } as const
    // @ts-expect-error the loader data of `/_authed` is missing
    void createIsolatedTestRouter(withoutAncestorData)
  })

  test('rejects loader data of the wrong shape', () => {
    const wrongPost = {
      ...postState,
      loaderData: {
        '/_authed': { unreadCount: 0 },
        '/_authed/posts/$postId': {
          post: { id: 'post-1', title: 'No status' },
        },
      },
    } as const
    // @ts-expect-error `authorId` and `status` are missing from the post
    void createIsolatedTestRouter(wrongPost)
  })

  test('rejects a route id that is not in the tree', () => {
    const unknownRoute = { ...postState, route: '/posts/$postId' } as const
    // @ts-expect-error the id of the route is `/_authed/posts/$postId`
    void createIsolatedTestRouter(unknownRoute)
  })

  test('takes the root route by rootRouteId', () => {
    void createIsolatedTestRouter({
      routeTree,
      route: rootRouteId,
      element: <PostHeader />,
      context: { locale: 'en', session: { user: testUser } },
    })
  })
})

describe('createTestRouter is typed from the generated route tree', () => {
  test('types a replacement like the option it replaces', () => {
    createTestRouter({
      routeTree,
      context: { locale: 'en' },
      overrides: {
        [rootRouteId]: {
          beforeLoad: ({ context }) => {
            expectTypeOf(context).toEqualTypeOf<{ locale: string }>()
            return { session: { user: testUser } }
          },
        },
        '/_authed': {
          beforeLoad: ({ context }) => {
            expectTypeOf(context.session).toEqualTypeOf<Session>()
            return { user: testUser }
          },
        },
        '/_authed/posts/$postId': {
          loader: ({ params, context }) => {
            expectTypeOf(params).toEqualTypeOf<{ postId: string }>()
            expectTypeOf(context.user).toEqualTypeOf<User>()
            return { post: createPost({ id: params.postId }) }
          },
        },
      },
    })
  })

  test('rejects a replacement that returns the wrong data', () => {
    const wrongLoader = {
      routeTree,
      context: { locale: 'en' },
      overrides: {
        '/_authed/posts/$postId': {
          loader: (): { post: Pick<Post, 'id'> } => ({ post: { id: '1' } }),
        },
      },
    }
    // @ts-expect-error the loader has to return a whole post
    createTestRouter(wrongLoader)
  })

  test('types the start location like a link', () => {
    const withoutParams = {
      routeTree,
      context: { locale: 'en' },
      location: { to: '/posts/$postId' },
    } as const
    // @ts-expect-error the path params are missing
    createTestRouter(withoutParams)
  })
})
