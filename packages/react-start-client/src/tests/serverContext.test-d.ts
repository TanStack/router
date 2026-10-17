import { expectTypeOf, test } from 'vitest'
import { createRootRoute, createRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/start-client-core'
import type { RouteContextOptions } from '@tanstack/react-router'

// `context`, `beforeLoad` and `loader` all receive Start's request-scoped
// `serverContext` (`undefined` on the client), typed from the route's server
// middleware in the same way.

const authMiddleware = createMiddleware().server(({ next }) =>
  next({ context: { user: 'u1' as const } }),
)

type ServerContext = { user: 'u1' } | undefined

const rootRoute = createRootRoute()

test('context receives serverContext like beforeLoad and loader', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'fn',
    server: { middleware: [authMiddleware] },
    context: ({ serverContext }) => {
      expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
      return { user: serverContext?.user }
    },
    beforeLoad: ({ serverContext }) => {
      expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
    },
    loader: ({ serverContext }) => {
      expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
    },
  })
})

test('the context object form passes serverContext to handler, dehydrate, hydrate and revalidate', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'object',
    server: { middleware: [authMiddleware] },
    context: {
      handler: ({ serverContext }) => {
        expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
        return { user: serverContext?.user }
      },
      dehydrate: ({ data, serverContext }) => {
        expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
        return { user: data.user }
      },
      hydrate: ({ data, serverContext }) => {
        expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
        return { user: data.user }
      },
      revalidate: ({ serverContext }) => {
        expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
        return { user: serverContext?.user }
      },
    },
  })
})

test('a context helper typed with the 5-argument RouteContextOptions is accepted next to route middleware', () => {
  const sharedContext = (
    ctx: RouteContextOptions<any, any, any, any, any>,
  ) => ({
    cause: ctx.cause,
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shared',
    server: { middleware: [authMiddleware] },
    context: sharedContext,
    beforeLoad: ({ serverContext }) => {
      expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shared-object',
    server: { middleware: [authMiddleware] },
    context: { handler: sharedContext, dehydrate: true },
    loader: ({ serverContext }) => {
      expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
    },
  })
})
