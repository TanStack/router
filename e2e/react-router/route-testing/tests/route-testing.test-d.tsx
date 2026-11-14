import { describe, expectTypeOf, test } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import {
  appTesting,
  createPost,
  routerTesting,
  testUser,
} from '../src/test-utils'
import type { Post, Session, User } from '../src/api'

const postState = {
  route: '/_authed/posts/$postId',
  params: { postId: 'post-1' },
  context: { locale: 'en', session: { user: testUser }, user: testUser },
  loaderData: { post: createPost() },
  routes: { '/_authed': { loaderData: { unreadCount: 0 } } },
} as const

describe('renderInRoute is typed from the generated route tree', () => {
  test('accepts the complete state of a route', () => {
    void routerTesting.renderInRoute(<PostHeader />, postState)
  })

  test('rejects a missing context value', () => {
    const withoutUser = {
      ...postState,
      context: { locale: 'en', session: { user: testUser } },
    } as const
    // @ts-expect-error `user` comes from the beforeLoad of `/_authed` and is missing
    void routerTesting.renderInRoute(<PostHeader />, withoutUser)
  })

  test('rejects missing loader data of the route and of its ancestors', () => {
    const { loaderData: _loaderData, ...withoutLoaderData } = postState
    // @ts-expect-error the loader data of the route is missing
    void routerTesting.renderInRoute(<PostHeader />, withoutLoaderData)

    const { routes: _routes, ...withoutAncestors } = postState
    // @ts-expect-error the loader data of `/_authed` is missing
    void routerTesting.renderInRoute(<PostHeader />, withoutAncestors)
  })

  test('rejects loader data of the wrong shape', () => {
    const wrongPost = {
      ...postState,
      loaderData: { post: { id: 'post-1', title: 'No status' } },
    } as const
    // @ts-expect-error `authorId` and `status` are missing from the post
    void routerTesting.renderInRoute(<PostHeader />, wrongPost)
  })

  test('rejects a route id that is not in the tree', () => {
    const unknownRoute = { ...postState, route: '/posts/$postId' } as const
    // @ts-expect-error the id of the route is `/_authed/posts/$postId`
    void routerTesting.renderInRoute(<PostHeader />, unknownRoute)
  })

  test('makes optional what the defaults of the application provide', () => {
    const onlyOwnState = {
      route: '/_authed/posts/$postId',
      params: { postId: 'post-1' },
      loaderData: { post: createPost() },
    } as const
    void appTesting.renderInRoute(<PostHeader />, onlyOwnState)

    // @ts-expect-error without defaults the context and the ancestors are required
    void routerTesting.renderInRoute(<PostHeader />, onlyOwnState)
  })
})

describe('createTestRouter is typed from the generated route tree', () => {
  test('types a replacement like the option it replaces', () => {
    routerTesting.createTestRouter({
      context: { locale: 'en' },
      routes: {
        __root__: {
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
      context: { locale: 'en' },
      routes: {
        '/_authed/posts/$postId': {
          loader: (): { post: Pick<Post, 'id'> } => ({ post: { id: '1' } }),
        },
      },
    }
    // @ts-expect-error the loader has to return a whole post
    routerTesting.createTestRouter(wrongLoader)
  })

  test('types the start location like a link', () => {
    const withoutParams = {
      context: { locale: 'en' },
      location: { to: '/posts/$postId' },
    } as const
    // @ts-expect-error the path params are missing
    routerTesting.createTestRouter(withoutParams)
  })
})
