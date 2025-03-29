import { expectTypeOf, test } from 'vitest'
import { json } from '../json'
import { createMiddleware } from '../createMiddleware'
import type { CreateServerFileRoute } from '../serverRoute'

test('createServerFileRoute with methods with no middleware', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverFileRoute = createServerFileRoute()

  expectTypeOf(serverFileRoute).toHaveProperty('methods')
  expectTypeOf(serverFileRoute).toHaveProperty('middleware')

  const serverFileRouteWithMethods1 = serverFileRoute.methods({
    GET: async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'test',
      })
    },
  })

  const serverFileRouteWithMethods2 = serverFileRoute.methods((r) => ({
    GET: r.handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'test',
      })
    }),
  }))

  expectTypeOf<
    keyof typeof serverFileRouteWithMethods1.client
  >().toEqualTypeOf<'get'>()

  expectTypeOf<
    keyof typeof serverFileRouteWithMethods2.client
  >().toEqualTypeOf<'get'>()

  expectTypeOf(serverFileRouteWithMethods1.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods1.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(serverFileRouteWithMethods2.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods2.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})

test('createServerFileRoute with methods and route middleware context', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const routeMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  const serverFileRouteWithMethods1 = serverFileRoute.methods({
    GET: async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: { a: string }
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'test',
      })
    },
  })

  expectTypeOf(serverFileRouteWithMethods1.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  const serverFileRouteWithMethods2 = serverFileRoute.methods((r) => ({
    GET: r.handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: { a: string }
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'test',
      })
    }),
  }))

  expectTypeOf(serverFileRouteWithMethods1.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods1.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(serverFileRouteWithMethods2.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods2.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})

test('createServerFileRoute with methods middleware and route middleware', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const routeMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  const methodMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { b: 'b' } }),
  )

  const serverRoute = serverFileRoute.methods((r) => ({
    GET: r.middleware([methodMiddleware]).handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: { a: string; b: string }
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'test',
      })
    }),
  }))

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})

test('createServerFileRoute methods validator with no input', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverRoute = createServerFileRoute().methods((r) => ({
    GET: r
      .validator(() => ({ a: 'a' }))
      .handler(async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: { a: string }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
  }))

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()
})

test('createServerFileRoute methods validator with search input', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverRoute = createServerFileRoute().methods((r) => ({
    GET: r
      .validator((input: { search: { query: string } }) => ({
        a: input.search.query,
      }))
      .handler(async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: { a: string }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
  }))

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search: { query: string }
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()
})

test('createServerFileRoute methods validator with body input', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverRoute = createServerFileRoute().methods((r) => ({
    GET: r
      .validator((input: { body: { query: string } }) => ({
        a: input.body.query,
      }))
      .handler(async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: { a: string }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
  }))

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown>
        body: { query: string }
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()
})

test('createServerFileRoute methods validator with headers input', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverRoute = createServerFileRoute().methods((r) => ({
    GET: r
      .validator((input: { headers: { query: string } }) => ({
        a: input.headers.query,
      }))
      .handler(async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: { a: string }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
  }))

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown>
        body?: unknown
        headers: { query: string }
      },
    ]
  >()

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()
})

test('createServerFileRoute methods validator with a complex union', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const serverRoute = createServerFileRoute().methods((r) => ({
    GET: r
      .validator(
        (
          input:
            | {
                search: { type: 'a' }
                body: { bodyA: 'a' }
                headers: { headerA: 'a' }
              }
            | {
                search: { type: 'b' }
                body: { bodyB: 'b' }
                headers: { bodyB: 'b' }
              },
        ) => input,
      )
      .handler(async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data:
            | {
                search: { type: 'a' }
                body: { bodyA: 'a' }
                headers: { headerA: 'a' }
              }
            | {
                search: { type: 'b' }
                body: { bodyB: 'b' }
                headers: { bodyB: 'b' }
              }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
  }))

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options:
        | {
            params: { detailId: string }
            search: { type: 'a' }
            body: { bodyA: 'a' }
            headers: { headerA: 'a' }
          }
        | {
            params: { detailId: string }
            search: { type: 'b' }
            body: { bodyB: 'b' }
            headers: { bodyB: 'b' }
          },
    ]
  >()

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()
})

test('createServerFileRoute with route middleware validator', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const routeMiddleware = createMiddleware().validator(() => ({ a: 'a' }))

  createServerFileRoute()
    .middleware([routeMiddleware])
    .methods({
      GET: async (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: { a: string }
          context: undefined
          params: { detailId: string }
          pathname: '$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      },
    })
})

test('createServerFileRoute with route middleware validator, methods middleware validator and methods validator', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  const routeMiddleware = createMiddleware().validator(() => ({ a: 'a' }))

  const methodMiddleware = createMiddleware().validator(() => ({ b: 'b' }))

  const serverRoute = createServerFileRoute()
    .middleware([routeMiddleware])
    .methods((r) => ({
      GET: r
        .middleware([methodMiddleware])
        .validator(() => {
          return { c: 'c' }
        })
        .handler(async (ctx) => {
          expectTypeOf(ctx).toEqualTypeOf<{
            data: { a: string; b: string; c: string }
            context: undefined
            params: { detailId: string }
            pathname: '$detailId'
            request: Request
          }>()

          return json({ test: 'test' })
        }),
    }))

  expectTypeOf(serverRoute.client.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverRoute.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown>
        headers?: Record<string, unknown>
        body?: unknown
      },
    ]
  >()
})

test('createServerFileRoute with a parent middleware context', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    'details',
    any,
    'details',
    'details',
    'details'
  > = undefined as any

  const routeMiddleware1 = createMiddleware().server(({ next }) => {
    return next({ context: { a: 'a' } })
  })

  const detailsServerRoute = createDetailsServerFileRoute().middleware([
    routeMiddleware1,
  ])

  const createDetailServerFileRoute: CreateServerFileRoute<
    'details/$detailId',
    typeof detailsServerRoute,
    'details/$detailId',
    '$detailId',
    'details/$detailId'
  > = undefined as any

  const routeMiddleware2 = createMiddleware().server(({ next }) => {
    return next({ context: { b: 'b' } })
  })

  const detailServerRoute1 = createDetailServerFileRoute()
    .middleware([routeMiddleware2])
    .methods({
      GET: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: undefined
          context: { a: string; b: string }
          params: { detailId: string }
          pathname: 'details/$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      },
    })

  const methodMiddleware = createMiddleware().server(({ next }) => {
    return next({ context: { c: 'c' } })
  })

  const detailServerRoute2 = createDetailServerFileRoute()
    .middleware([routeMiddleware2])
    .methods((r) => ({
      GET: r.middleware([methodMiddleware]).handler((ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          data: undefined
          context: { a: string; b: string; c: string }
          params: { detailId: string }
          pathname: 'details/$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
    }))

  expectTypeOf(detailServerRoute1.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(detailServerRoute2.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})

test('createServerFileRoute with parent middleware params', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    '$userId',
    any,
    '$userId',
    '$userId',
    '$userId'
  > = undefined as any

  const detailsServerRoute = createDetailsServerFileRoute()

  const createDetailServerFileRoute: CreateServerFileRoute<
    '$userId/$detailId',
    typeof detailsServerRoute,
    '$userId/$detailId',
    '$detailId',
    '$userId/$detailId'
  > = undefined as any

  const detailServerRoute1 = createDetailServerFileRoute().methods({
    GET: (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: { userId: string; detailId: string }
        pathname: '$userId/$detailId'
        request: Request
      }>()

      return json({ test: 'test' })
    },
  })

  const detailServerRoute2 = createDetailServerFileRoute().methods((r) => ({
    GET: r.handler((ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: { userId: string; detailId: string }
        pathname: '$userId/$detailId'
        request: Request
      }>()

      return json({ test: 'test' })
    }),
  }))

  expectTypeOf(detailServerRoute1.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { userId: string; detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(detailServerRoute2.client.get).parameters.toEqualTypeOf<
    [
      options: {
        params: { userId: string; detailId: string }
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})

test('createServerFileRoute with no params', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    'details',
    any,
    'details',
    'details',
    'details'
  > = undefined as any

  const detailServerRoute1 = createDetailsServerFileRoute().methods({
    GET: (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: {}
        pathname: 'details'
        request: Request
      }>()

      return json({ test: 'test' })
    },
  })

  const detailServerRoute2 = createDetailsServerFileRoute().methods((r) => ({
    GET: r.handler((ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        data: undefined
        context: undefined
        params: {}
        pathname: 'details'
        request: Request
      }>()

      return json({ test: 'test' })
    }),
  }))

  expectTypeOf(detailServerRoute1.client.get).parameters.toEqualTypeOf<
    [
      options?: {
        params?: {}
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()

  expectTypeOf(detailServerRoute2.client.get).parameters.toEqualTypeOf<
    [
      options?: {
        params?: {}
        search?: Record<string, unknown> | undefined
        body?: unknown
        headers?: Record<string, unknown> | undefined
      },
    ]
  >()
})
