import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import type { Constrain, Validator } from '@tanstack/react-router'

test('createServeMiddleware removes middleware after middleware,', () => {
  const middleware = createMiddleware()

  expectTypeOf(middleware).toHaveProperty('middleware')
  expectTypeOf(middleware).toHaveProperty('server')
  expectTypeOf(middleware).toHaveProperty('validator')

  const middlewareAfterMiddleware = middleware.middleware([])

  expectTypeOf(middlewareAfterMiddleware).toHaveProperty('validator')
  expectTypeOf(middlewareAfterMiddleware).toHaveProperty('server')
  expectTypeOf(middlewareAfterMiddleware).not.toHaveProperty('middleware')

  const middlewareAfterInput = middleware.validator(() => {})

  expectTypeOf(middlewareAfterInput).toHaveProperty('server')
  expectTypeOf(middlewareAfterInput).not.toHaveProperty('middleware')

  const middlewareAfterServer = middleware.server(async (options) => {
    expectTypeOf(options.context).toEqualTypeOf<undefined>()
    expectTypeOf(options.data).toEqualTypeOf<undefined>()
    expectTypeOf(options.method).toEqualTypeOf<'GET' | 'POST'>()

    const result = await options.next({
      context: {
        a: 'a',
      },
    })

    expectTypeOf(result.context).toEqualTypeOf<{ a: string }>()

    expectTypeOf(result.sendContext).toEqualTypeOf<undefined>()

    return result
  })

  expectTypeOf(middlewareAfterServer).not.toHaveProperty('server')
  expectTypeOf(middlewareAfterServer).not.toHaveProperty('input')
  expectTypeOf(middlewareAfterServer).not.toHaveProperty('middleware')
})

test('createMiddleware merges server context', () => {
  const middleware1 = createMiddleware().server(async (options) => {
    expectTypeOf(options.context).toEqualTypeOf<undefined>()
    expectTypeOf(options.data).toEqualTypeOf<undefined>()
    expectTypeOf(options.method).toEqualTypeOf<'GET' | 'POST'>()

    const result = await options.next({ context: { a: true } })

    expectTypeOf(result).toEqualTypeOf<{
      'use functions must return the result of next()': true
      _types: {
        context: {
          a: boolean
        }
        sendContext: undefined
      }
      context: { a: boolean }
      sendContext: undefined
    }>()

    return result
  })

  const middleware2 = createMiddleware().server(async (options) => {
    expectTypeOf(options.context).toEqualTypeOf<undefined>()
    expectTypeOf(options.data).toEqualTypeOf<undefined>()
    expectTypeOf(options.method).toEqualTypeOf<'GET' | 'POST'>()

    const result = await options.next({ context: { b: 'test' } })

    expectTypeOf(result).toEqualTypeOf<{
      'use functions must return the result of next()': true
      _types: {
        context: {
          b: string
        }
        sendContext: undefined
      }
      context: { b: string }
      sendContext: undefined
    }>()

    return result
  })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{ a: boolean; b: string }>()

      const result = await options.next({ context: { c: 0 } })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            c: number
          }
          sendContext: undefined
        }
        context: { a: boolean; b: string; c: number }
        sendContext: undefined
      }>()

      return result
    })

  createMiddleware()
    .middleware([middleware3])
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()

      const result = await options.next({ context: { d: 5 } })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            d: number
          }
          sendContext: undefined
        }
        context: { a: boolean; b: string; c: number; d: number }
        sendContext: undefined
      }>()

      return result
    })
})

test('createMiddleware merges client context and sends to the server', () => {
  const middleware1 = createMiddleware().client(async (options) => {
    expectTypeOf(options.context).toEqualTypeOf<undefined>()

    const result = await options.next({ context: { a: true } })

    expectTypeOf(result).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
      sendContext: undefined
      headers: HeadersInit
    }>()

    return result
  })

  const middleware2 = createMiddleware().client(async (options) => {
    expectTypeOf(options.context).toEqualTypeOf<undefined>()

    const result = await options.next({ context: { b: 'test' } })

    expectTypeOf(result).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { b: string }
      sendContext: undefined
      headers: HeadersInit
    }>()

    return result
  })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{ a: boolean; b: string }>()

      const result = await options.next({ context: { c: 0 } })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: { a: boolean; b: string; c: number }
        sendContext: undefined
        headers: HeadersInit
      }>()

      return result
    })

  const middleware4 = createMiddleware()
    .middleware([middleware3])
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()

      const result = await options.next({
        sendContext: { ...options.context, d: 5 },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: { a: boolean; b: string; c: number }
        sendContext: { a: boolean; b: string; c: number; d: number }
        headers: HeadersInit
      }>()

      return result
    })

  createMiddleware()
    .middleware([middleware4])
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
        d: number
      }>()

      const result = await options.next({
        context: {
          e: 'e',
        },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            e: string
          }
          sendContext: undefined
        }
        context: { a: boolean; b: string; c: number; d: number; e: string }
        sendContext: undefined
      }>()

      return result
    })
})

test('createMiddleware merges input', () => {
  const middleware1 = createMiddleware()
    .validator(() => {
      return {
        a: 'a',
      } as const
    })
    .server(({ data, next }) => {
      expectTypeOf(data).toEqualTypeOf<{ readonly a: 'a' }>()
      return next()
    })

  const middleware2 = createMiddleware()
    .middleware([middleware1])
    .validator(() => {
      return {
        b: 'b',
      } as const
    })
    .server(({ data, next }) => {
      expectTypeOf(data).toEqualTypeOf<{ readonly a: 'a'; readonly b: 'b' }>
      return next()
    })

  createMiddleware()
    .middleware([middleware2])
    .validator(() => ({ c: 'c' }) as const)
    .server(({ next, data }) => {
      expectTypeOf(data).toEqualTypeOf<{
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }>
      return next()
    })
})

test('createMiddleware merges server context and client context, sends server context to the client and merges ', () => {
  const middleware1 = createMiddleware()
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<undefined>()

      const result = await options.next({
        context: { fromClient1: 'fromClient1' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: { fromClient1: string }
        sendContext: undefined
        headers: HeadersInit
      }>()

      return result
    })
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<undefined>()

      const result = await options.next({
        context: { fromServer1: 'fromServer1' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            fromServer1: string
          }
          sendContext: undefined
        }
        context: { fromServer1: string }
        sendContext: undefined
      }>()

      return result
    })

  const middleware2 = createMiddleware()
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<undefined>()

      const result = await options.next({
        context: { fromClient2: 'fromClient2' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: { fromClient2: string }
        sendContext: undefined
        headers: HeadersInit
      }>()

      return result
    })
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<undefined>()

      const result = await options.next({
        context: { fromServer2: 'fromServer2' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            fromServer2: string
          }
          sendContext: undefined
        }
        context: { fromServer2: string }
        sendContext: undefined
      }>()

      return result
    })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
      }>()

      const result = await options.next({
        context: { fromClient3: 'fromClient3' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: {
          fromClient1: string
          fromClient2: string
          fromClient3: string
        }
        sendContext: undefined
        headers: HeadersInit
      }>()

      return result
    })
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromServer1: string
        fromServer2: string
      }>()

      const result = await options.next({
        context: { fromServer3: 'fromServer3' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            fromServer3: string
          }
          sendContext: undefined
        }
        context: {
          fromServer1: string
          fromServer2: string
          fromServer3: string
        }
        sendContext: undefined
      }>()

      return result
    })

  const middleware4 = createMiddleware()
    .middleware([middleware3])
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
        fromClient3: string
      }>()

      const result = await options.next({
        context: { fromClient4: 'fromClient4' },
        sendContext: { toServer1: 'toServer1' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: {
          fromClient1: string
          fromClient2: string
          fromClient3: string
          fromClient4: string
        }
        sendContext: { toServer1: 'toServer1' }
        headers: HeadersInit
      }>()

      return result
    })
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromServer1: string
        fromServer2: string
        fromServer3: string
        toServer1: 'toServer1'
      }>()

      const result = await options.next({
        context: { fromServer4: 'fromServer4' },
        sendContext: { toClient1: 'toClient1' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            fromServer4: string
          }
          sendContext: {
            toClient1: 'toClient1'
          }
        }
        context: {
          fromServer1: string
          fromServer2: string
          fromServer3: string
          fromServer4: string
          toServer1: 'toServer1'
        }
        sendContext: { toClient1: 'toClient1' }
      }>()

      return result
    })

  createMiddleware()
    .middleware([middleware4])
    .client(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromClient1: string
        fromClient2: string
        fromClient3: string
        fromClient4: string
      }>()

      const result = await options.next({
        context: { fromClient5: 'fromClient5' },
        sendContext: { toServer2: 'toServer2' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        context: {
          fromClient1: string
          fromClient2: string
          fromClient3: string
          fromClient4: string
          fromClient5: string
          toClient1: 'toClient1'
        }
        sendContext: { toServer1: 'toServer1'; toServer2: 'toServer2' }
        headers: HeadersInit
      }>()

      return result
    })
    .server(async (options) => {
      expectTypeOf(options.context).toEqualTypeOf<{
        fromServer1: string
        fromServer2: string
        fromServer3: string
        fromServer4: string
        toServer1: 'toServer1'
        toServer2: 'toServer2'
      }>()

      const result = await options.next({
        context: { fromServer5: 'fromServer5' },
        sendContext: { toClient2: 'toClient2' },
      })

      expectTypeOf(result).toEqualTypeOf<{
        'use functions must return the result of next()': true
        _types: {
          context: {
            fromServer5: string
          }
          sendContext: {
            toClient2: 'toClient2'
          }
        }
        context: {
          fromServer1: string
          fromServer2: string
          fromServer3: string
          fromServer4: string
          fromServer5: string
          toServer1: 'toServer1'
          toServer2: 'toServer2'
        }
        sendContext: { toClient1: 'toClient1'; toClient2: 'toClient2' }
      }>()

      return result
    })
})

test('createMiddleware sendContext cannot send a function', () => {
  createMiddleware()
    .client(({ next }) => {
      expectTypeOf(next<{ func: () => 'func' }>)
        .parameter(0)
        .exclude<undefined>()
        .toHaveProperty('sendContext')
        .toEqualTypeOf<{ func: 'Function is not serializable' } | undefined>()

      return next()
    })
    .server(({ next }) => {
      expectTypeOf(next<undefined, { func: () => 'func' }>)
        .parameter(0)
        .exclude<undefined>()
        .toHaveProperty('sendContext')
        .toEqualTypeOf<{ func: 'Function is not serializable' } | undefined>()

      return next()
    })
})

test('createMiddleware cannot validate function', () => {
  const validator = createMiddleware().validator<
    (input: { func: () => 'string' }) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .toEqualTypeOf<
      Constrain<
        (input: { func: () => 'string' }) => { output: 'string' },
        Validator<{ func: 'Function is not serializable' }, any>
      >
    >()
})

test('createMiddleware can validate Date', () => {
  const validator = createMiddleware().validator<
    (input: Date) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .toEqualTypeOf<
      Constrain<(input: Date) => { output: 'string' }, Validator<Date, any>>
    >()
})

test('createMiddleware can validate FormData', () => {
  const validator = createMiddleware().validator<
    (input: FormData) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .toEqualTypeOf<
      Constrain<
        (input: FormData) => { output: 'string' },
        Validator<FormData, any>
      >
    >()
})
