import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'

test('createServeMiddleware removes middleware after middleware,', () => {
  const middleware = createMiddleware()

  expectTypeOf(middleware).toHaveProperty('middleware')
  expectTypeOf(middleware).toHaveProperty('server')
  expectTypeOf(middleware).toHaveProperty('input')

  const middlewareAfterMiddleware = middleware.middleware([])

  expectTypeOf(middlewareAfterMiddleware).toHaveProperty('input')
  expectTypeOf(middlewareAfterMiddleware).toHaveProperty('server')
  expectTypeOf(middlewareAfterMiddleware).not.toHaveProperty('middleware')

  const middlewareAfterInput = middleware.input(() => {})

  expectTypeOf(middlewareAfterInput).toHaveProperty('input')
  expectTypeOf(middlewareAfterInput).toHaveProperty('server')
  expectTypeOf(middlewareAfterInput).not.toHaveProperty('middleware')

  const middlewareAfterServer = middleware.server(({ next }) => {
    return next({
      context: {
        a: 'a',
      },
    })
  })

  expectTypeOf(middlewareAfterServer).toHaveProperty('clientAfter')
  expectTypeOf(middlewareAfterServer).not.toHaveProperty('server')
  expectTypeOf(middlewareAfterServer).not.toHaveProperty('input')
  expectTypeOf(middlewareAfterServer).not.toHaveProperty('middleware')
})

test('createMiddleware merges server context', () => {
  const middleware1 = createMiddleware().server(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
      clientAfterContext: undefined
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

test('createMiddleware merges client context and sends to the server', () => {
  const middleware1 = createMiddleware().client(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<undefined>()
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
      sendContext: undefined
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
      return next({ sendContext: { ...context, c: 5 } })
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

test('createMiddleware merges server context and client context, sends server context to the client and merges ', () => {
  const middleware1 = createMiddleware()
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<undefined>()
      return next({ context: { fromClient1: 'fromClient1' } })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<undefined>()
      return next({ context: { fromServer1: 'fromServer1' } })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ fromClient1: string }>()
      return next({ context: { clientAfter1: 'clientAfter1' } })
    })

  const middleware2 = createMiddleware()
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<undefined>()
      return next({ context: { fromClient2: 'fromClient2' } })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<undefined>()
      return next({ context: { fromServer2: 'fromServer2' } })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ fromClient2: string }>()
      return next({ context: { clientAfter2: 'clientAfter2' } })
    })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
      }>()
      return next({ context: { fromClient3: 'fromClient3' } })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromServer1: string
        fromServer2: string
      }>()

      return next({ context: { fromServer3: 'fromServer3' } })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
        fromClient3: string
        clientAfter1: string
        clientAfter2: string
      }>()
      return next({ context: { clientAfter3: 'clientAfter3' } })
    })

  createMiddleware()
    .middleware([middleware3])
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
        fromClient3: string
      }>()
      return next({
        context: { fromClient4: 'fromClient4' },
        sendContext: { toServer1: 'toServer1' },
      })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromServer1: string
        fromServer2: string
        fromServer3: string
        toServer1: string
      }>()
      return next({
        context: { fromServer4: 'fromServer4' },
        sendContext: { toClient1: 'toClient1' },
      })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
        clientAfter1: string
        clientAfter2: string
        fromClient3: string
        clientAfter3: string
        fromClient4: string
        toClient1: string
      }>
      return next({ context: { clientAfter4: 'clientAfter4' } })
    })
})
