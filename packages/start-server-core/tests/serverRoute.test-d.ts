import { expectTypeOf, test } from 'vitest'
import { json } from '../../start-client-core/src/json'
import { createMiddleware } from '../../start-client-core/src/createMiddleware'
import type { CreateServerFileRoute } from '../src/serverRoute'

test('createServerFileRoute with methods with no middleware', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path,
    unknown
  > = undefined as any

  const serverFileRoute = createServerFileRoute()

  expectTypeOf(serverFileRoute).toHaveProperty('methods')
  expectTypeOf(serverFileRoute).toHaveProperty('middleware')

  const serverFileRouteWithMethods1 = serverFileRoute.methods({
    GET: async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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
})

test('createServerFileRoute with methods and route middleware context', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path,
    unknown
  > = undefined as any

  const routeMiddleware = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  const serverFileRouteWithMethods1 = serverFileRoute.methods({
    GET: async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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

  const serverFileRouteWithMethods2 = serverFileRoute.methods((r) => ({
    GET: r.handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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
})

test('createServerFileRoute with methods middleware and route middleware', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path,
    unknown
  > = undefined as any

  const routeMiddleware = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  const methodMiddleware = createMiddleware({ type: 'function' }).server(
    ({ next }) => next({ context: { b: 'b' } }),
  )

  const serverRoute = serverFileRoute.methods((r) => ({
    GET: r.middleware([methodMiddleware]).handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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
})

test('createServerFileRoute with a parent middleware context', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    'details',
    any,
    'details',
    'details',
    'details',
    unknown
  > = undefined as any

  const routeMiddleware1 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { a: 'a' } })
    },
  )

  const detailsServerRoute = createDetailsServerFileRoute().middleware([
    routeMiddleware1,
  ])

  const createDetailServerFileRoute: CreateServerFileRoute<
    'details/$detailId',
    typeof detailsServerRoute,
    'details/$detailId',
    '$detailId',
    'details/$detailId',
    unknown
  > = undefined as any

  const routeMiddleware2 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { b: 'b' } })
    },
  )

  const detailServerRoute1 = createDetailServerFileRoute()
    .middleware([routeMiddleware2])
    .methods({
      GET: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          context: { a: string; b: string }
          params: { detailId: string }
          pathname: 'details/$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      },
    })

  const methodMiddleware = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { c: 'c' } })
    },
  )

  const detailServerRoute2 = createDetailServerFileRoute()
    .middleware([routeMiddleware2])
    .methods((r) => ({
      GET: r.middleware([methodMiddleware]).handler((ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<{
          context: { a: string; b: string; c: string }
          params: { detailId: string }
          pathname: 'details/$detailId'
          request: Request
        }>()

        return json({ test: 'test' })
      }),
    }))
})

test('createServerFileRoute with parent middleware params', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    '$userId',
    any,
    '$userId',
    '$userId',
    '$userId',
    unknown
  > = undefined as any

  const detailsServerRoute = createDetailsServerFileRoute()

  const createDetailServerFileRoute: CreateServerFileRoute<
    '$userId/$detailId',
    typeof detailsServerRoute,
    '$userId/$detailId',
    '$detailId',
    '$userId/$detailId',
    unknown
  > = undefined as any

  const detailServerRoute1 = createDetailServerFileRoute().methods({
    GET: (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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
        context: undefined
        params: { userId: string; detailId: string }
        pathname: '$userId/$detailId'
        request: Request
      }>()

      return json({ test: 'test' })
    }),
  }))
})

test('createServerFileRoute with no params', () => {
  const createDetailsServerFileRoute: CreateServerFileRoute<
    'details',
    any,
    'details',
    'details',
    'details',
    unknown
  > = undefined as any

  const detailServerRoute1 = createDetailsServerFileRoute().methods({
    GET: (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
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
        context: undefined
        params: {}
        pathname: 'details'
        request: Request
      }>()

      return json({ test: 'test' })
    }),
  }))
})
