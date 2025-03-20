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
          test: 'hi',
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
        test: 'hi',
      })
    }),
  }))
})

test('createServerFileRoute with methods with with middleware', () => {
  const serverMiddleware = createMiddleware().server(({ next }) =>
    next({ context: { a: 'a' } }),
  )

  const serverFileRoute = createServerFileRoute<'$detailId'>()().middleware([
    serverMiddleware,
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
          test: 'hi',
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
        test: 'hi',
      })
    }),
  }))
})
