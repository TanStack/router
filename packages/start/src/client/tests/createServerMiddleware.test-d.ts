import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'

test('createServeMiddleware removes middleware and input', () => {
  const middleware = createMiddleware()

  expectTypeOf(middleware).toHaveProperty('middleware')
  expectTypeOf(middleware).toHaveProperty('server')
  expectTypeOf(middleware).toHaveProperty('input')

  const middlewareWithMiddleware = middleware.middleware([])

  expectTypeOf(middlewareWithMiddleware).toHaveProperty('input')
  expectTypeOf(middlewareWithMiddleware).toHaveProperty('server')
  expectTypeOf(middlewareWithMiddleware).not.toHaveProperty('middleware')

  const middlewareWithInput = middleware.input(() => {})

  expectTypeOf(middlewareWithInput).toHaveProperty('input')
  expectTypeOf(middlewareWithInput).toHaveProperty('server')
  expectTypeOf(middlewareWithInput).not.toHaveProperty('middleware')

  const middlewareWithServer = middleware.server(({ next }) => {
    return next({
      context: {
        a: 'a',
      },
    })
  })

  expectTypeOf(middlewareWithServer).toHaveProperty('server')
  expectTypeOf(middlewareWithServer).not.toHaveProperty('input')
  expectTypeOf(middlewareWithServer).not.toHaveProperty('middleware')
})

test('createMiddleware merges server context', () => {
  const middleware1 = createMiddleware().server(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
    }>()
    return await next({ context: { a: true } })
  })

  const middleware2 = createMiddleware().server(({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    return next({ context: { b: 'test' } })
  })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean; b: string }>()
      return next({ context: { c: 0 } })
    })

  createMiddleware()
    .middleware([middleware3])
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()
      return next({ context: { c: 5 } })
    })
})

test('createMiddleware merges client context', () => {
  const middleware1 = createMiddleware().client(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
      serverContext: undefined
      headers: HeadersInit
    }>()
    return await next({ context: { a: true } })
  })

  const middleware2 = createMiddleware().client(({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    return next({ context: { b: 'test' } })
  })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean; b: string }>()
      return next({ context: { c: 0 } })
    })

  const middleware4 = createMiddleware()
    .middleware([middleware3])
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()
      return next({ serverContext: { ...context, c: 5 } })
    })

  createMiddleware()
    .middleware([middleware4])
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()
      return next()
    })
})

test('createMiddleware merges input', () => {
  const middleware1 = createMiddleware()
    .input(() => {
      return {
        a: 'a',
      } as const
    })
    .server(({ input, next }) => {
      expectTypeOf(input).toEqualTypeOf<{ readonly a: 'a' }>()
      return next()
    })

  const middleware2 = createMiddleware()
    .middleware([middleware1])
    .input(() => {
      return {
        b: 'b',
      } as const
    })
    .server(({ input, next }) => {
      expectTypeOf(input).toEqualTypeOf<{ readonly a: 'a'; readonly b: 'b' }>
      return next()
    })

  createMiddleware()
    .middleware([middleware2])
    .input(() => ({ c: 'c' }) as const)
    .server(({ next, input }) => {
      expectTypeOf(input).toEqualTypeOf<{
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }>
      return next()
    })
})
