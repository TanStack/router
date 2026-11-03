import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createRootRoute } from '@tanstack/solid-router'
import { createMiddleware } from '@tanstack/start-client-core'
import type { RouteContextOptions } from '@tanstack/solid-router'

// `context`, `beforeLoad` and `loader` all receive Start's request-scoped
// `serverContext` (`undefined` on the client), typed from the route's server
// middleware in the same way. File routes, because they type route middleware.

const authMiddleware = createMiddleware().server(({ next }) =>
  next({ context: { user: 'u1' as const } }),
)

type ServerContext = { user: 'u1' } | undefined

const _rootRoute = createRootRoute()

const fnRoute = createFileRoute('/fn')({
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

const objectRoute = createFileRoute('/object')({
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

const sharedContext = (ctx: RouteContextOptions<any, any, any, any, any>) => ({
  cause: ctx.cause,
})

const sharedRoute = createFileRoute('/shared')({
  server: { middleware: [authMiddleware] },
  context: sharedContext,
  beforeLoad: ({ serverContext }) => {
    expectTypeOf(serverContext).toEqualTypeOf<ServerContext>()
  },
})

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/fn': {
      id: '/fn'
      path: '/fn'
      fullPath: '/fn'
      preLoaderRoute: typeof fnRoute
      parentRoute: typeof _rootRoute
    }
    '/object': {
      id: '/object'
      path: '/object'
      fullPath: '/object'
      preLoaderRoute: typeof objectRoute
      parentRoute: typeof _rootRoute
    }
    '/shared': {
      id: '/shared'
      path: '/shared'
      fullPath: '/shared'
      preLoaderRoute: typeof sharedRoute
      parentRoute: typeof _rootRoute
    }
  }
}

test('context receives serverContext like beforeLoad and loader', () => {
  expectTypeOf(fnRoute.types.routeContext).toEqualTypeOf<{
    user: 'u1' | undefined
  }>()
})

test('the context object form passes serverContext to handler, dehydrate, hydrate and revalidate', () => {
  expectTypeOf(objectRoute.types.routeContext).toEqualTypeOf<{
    user: 'u1' | undefined
  }>()
})

test('a context helper typed with the 5-argument RouteContextOptions is accepted next to route middleware', () => {
  expectTypeOf(sharedRoute.types.routeContext).toEqualTypeOf<{
    cause: 'preload' | 'enter' | 'stay'
  }>()
})
