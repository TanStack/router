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
    keyof typeof serverFileRouteWithMethods1.methods
  >().toEqualTypeOf<'get'>()

  expectTypeOf<
    keyof typeof serverFileRouteWithMethods2.methods
  >().toEqualTypeOf<'get'>()

  expectTypeOf(serverFileRouteWithMethods1.methods.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods2.methods.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
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

  expectTypeOf(serverFileRouteWithMethods1.methods.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
  >()

  expectTypeOf(serverFileRouteWithMethods2.methods.get).returns.toEqualTypeOf<
    Promise<{
      test: string
    }>
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

  serverFileRoute.methods((r) => ({
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
})

test('createServerFileRoute with methods validator', () => {
  type Path = '$detailId'
  const createServerFileRoute: CreateServerFileRoute<
    Path,
    any,
    Path,
    Path,
    Path
  > = undefined as any

  createServerFileRoute().methods((r) => ({
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

  createServerFileRoute()
    .middleware([routeMiddleware])
    .methods((r) => ({
      GET: r
        .middleware([methodMiddleware])
        .validator(() => ({ c: 'c' }))
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

  createDetailServerFileRoute()
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

  createDetailServerFileRoute()
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
})
