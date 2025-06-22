import { expectTypeOf, test } from 'vitest'
import { json } from '../../router-ssr-core/src/client/json'
import { createMiddleware } from '../../start-client-core/src/createMiddleware'
import { createServerFileRoute as defaultCreateServerFileRoute } from '../src/serverRoute'
import type { CreateServerFileRoute } from '../src/serverRoute'

test('createServerFileRoute with methods with no middleware', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    any,
    Path,
    Path,
    Path,
    unknown
  > = defaultCreateServerFileRoute as never

  const serverFileRoute = createServerFileRoute()

  expectTypeOf(serverFileRoute).toHaveProperty('methods')
  expectTypeOf(serverFileRoute).toHaveProperty('middleware')

  serverFileRoute.methods({
    GET: (ctx) => {
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

  serverFileRoute.methods((r) => ({
    GET: r.handler((ctx) => {
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
    any,
    Path,
    Path,
    Path,
    unknown
  > = defaultCreateServerFileRoute as never

  const routeMiddleware = createMiddleware({ type: 'request' }).server(
    ({ next }) => next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  serverFileRoute.methods({
    GET: (ctx) => {
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

  serverFileRoute.methods((r) => ({
    GET: r.handler((ctx) => {
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
    any,
    Path,
    Path,
    Path,
    unknown
  > = defaultCreateServerFileRoute as never

  const routeMiddleware = createMiddleware({ type: 'request' }).server(
    ({ next }) => next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute().middleware([routeMiddleware])

  const methodMiddleware = createMiddleware({ type: 'request' }).server(
    ({ next }) => next({ context: { b: 'b' } }),
  )

  serverFileRoute.methods((r) => ({
    GET: r.middleware([methodMiddleware]).handler((ctx) => {
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
    any,
    'details',
    'details',
    'details',
    unknown
  > = defaultCreateServerFileRoute as never

  const routeMiddleware1 = createMiddleware({ type: 'request' }).server(
    ({ next }) => {
      return next({ context: { a: 'a' } })
    },
  )

  const _detailsServerRoute = createDetailsServerFileRoute().middleware([
    routeMiddleware1,
  ])

  const createDetailServerFileRoute: CreateServerFileRoute<
    typeof _detailsServerRoute,
    'details/$detailId',
    '$detailId',
    'details/$detailId',
    unknown
  > = defaultCreateServerFileRoute as never

  const routeMiddleware2 = createMiddleware({ type: 'request' }).server(
    ({ next }) => {
      return next({ context: { b: 'b' } })
    },
  )

  createDetailServerFileRoute()
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

  const methodMiddleware = createMiddleware({ type: 'request' }).server(
    ({ next }) => {
      return next({ context: { c: 'c' } })
    },
  )

  createDetailServerFileRoute()
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
    any,
    '$userId',
    '$userId',
    '$userId',
    unknown
  > = defaultCreateServerFileRoute as never

  const _detailsServerRoute = createDetailsServerFileRoute()

  const createDetailServerFileRoute: CreateServerFileRoute<
    typeof _detailsServerRoute,
    '$userId/$detailId',
    '$detailId',
    '$userId/$detailId',
    unknown
  > = defaultCreateServerFileRoute as never

  createDetailServerFileRoute().methods({
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

  createDetailServerFileRoute().methods((r) => ({
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
    any,
    'details',
    'details',
    'details',
    unknown
  > = defaultCreateServerFileRoute as never

  createDetailsServerFileRoute().methods({
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

  createDetailsServerFileRoute().methods((r) => ({
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
