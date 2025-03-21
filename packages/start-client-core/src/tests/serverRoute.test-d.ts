import { expectTypeOf, test } from 'vitest'
import { createServerFileRoute } from '../serverRoute'
import { json } from '../json'
import { createMiddleware } from '../createMiddleware'

test('createServerFileRoute with methods with no middleware', () => {
  const serverFileRoute = createServerFileRoute<'$detailId'>()()

  expectTypeOf(serverFileRoute).toHaveProperty('methods')
  expectTypeOf(serverFileRoute).toHaveProperty('middleware')

  serverFileRoute.methods({
    GET: {
      handler: async (ctx) => {
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
    },
  })

  serverFileRoute.methods((r) => ({
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
  const routeMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute<'$detailId'>()().middleware([
    routeMiddleware,
  ])

  serverFileRoute.methods({
    GET: {
      handler: async (ctx) => {
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
    },
  })

  serverFileRoute.methods((r) => ({
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
  const routeMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute<'$detailId'>()().middleware([
    routeMiddleware,
  ])

  const methodMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { b: 'b' } }),
  )

  serverFileRoute.methods((r) => ({
    GET: r.middleware([methodMiddleware]).handler(async (ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        context: { a: string; b: string }
        params: { detailId: string }
        pathname: '$detailId'
        request: Request
      }>()

      return json({
        test: 'hi',
      })
    }),
  }))
})
