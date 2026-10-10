import { expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute } from '@tanstack/react-router'
import type {} from '@tanstack/start-client-core'

const rootRoute = createRootRoute()

const parentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users/$userId',
  params: {
    parse: ({ userId }) => ({ userId: Number(userId) }),
    stringify: ({ userId }) => ({ userId: String(userId) }),
  },
})

test('server handlers receive raw path params even when params.parse is defined', () => {
  createRoute({
    getParentRoute: () => parentRoute,
    path: '/posts/$postId',
    params: {
      parse: ({ postId }) => ({ postId: Number(postId) }),
      stringify: ({ postId }) => ({ postId: String(postId) }),
    },
    server: {
      handlers: {
        GET: ({ params }) => {
          expectTypeOf(params).toEqualTypeOf<{
            userId: string
            postId: string
          }>()
          return new Response()
        },
      },
    },
    loader: ({ params }) => {
      expectTypeOf(params).toEqualTypeOf<{
        userId: number
        postId: number
      }>()
    },
  })
})

test('createHandlers handlers receive raw path params', () => {
  createRoute({
    getParentRoute: () => parentRoute,
    path: '/files/$',
    server: {
      handlers: ({ createHandlers }) =>
        createHandlers({
          GET: {
            handler: ({ params }) => {
              expectTypeOf(params).toEqualTypeOf<{
                userId: string
                _splat?: string
              }>()
              return new Response()
            },
          },
        }),
    },
  })
})
