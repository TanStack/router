import { expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'

test('createServeMiddleware removes middleware and input', () => {
  const middleware = createMiddleware({
    id: 'test1',
  })

  expectTypeOf(middleware).toHaveProperty('middleware')
  expectTypeOf(middleware).toHaveProperty('use')
  expectTypeOf(middleware).toHaveProperty('input')

  const middlewareWithMiddleware = middleware.middleware([])

  expectTypeOf(middlewareWithMiddleware).toHaveProperty('input')
  expectTypeOf(middlewareWithMiddleware).toHaveProperty('use')
  expectTypeOf(middlewareWithMiddleware).not.toHaveProperty('middleware')

  const middlewareWithInput = middleware.input(() => {})

  expectTypeOf(middlewareWithInput).toHaveProperty('input')
  expectTypeOf(middlewareWithInput).toHaveProperty('use')
  expectTypeOf(middlewareWithInput).not.toHaveProperty('middleware')

  const middlewareWithUse = middleware.use(({ next }) => {
    return next({
      context: {
        a: 'a',
      },
    })
  })

  expectTypeOf(middlewareWithUse).toHaveProperty('use')
  expectTypeOf(middlewareWithUse).not.toHaveProperty('input')
  expectTypeOf(middlewareWithUse).not.toHaveProperty('middleware')
})

test('createMiddleware merges context', () => {
  const middleware1 = createMiddleware({
    id: 'test1',
  }).use(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<never>
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
    }>()
    return await next({ context: { a: true } })
  })

  const middleware2 = createMiddleware({
    id: 'test2',
  }).use(({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<never>()
    return next({ context: { b: 'test' } })
  })

  const middleware3 = createMiddleware({
    id: 'test3',
  })
    .middleware([middleware1, middleware2])
    .use(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean; b: string }>()
      return next({ context: { c: 0 } })
    })

  createMiddleware({
    id: 'test4',
  })
    .middleware([middleware3])
    .use(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        a: boolean
        b: string
        c: number
      }>()
      return next({ context: { c: 5 } })
    })
})

test('createMiddleware merges input', () => {
  const middleware1 = createMiddleware({ id: 'test1' })
    .input(() => {
      return {
        a: 'a',
      } as const
    })
    .use(({ input, next }) => {
      expectTypeOf(input).toEqualTypeOf<{ readonly a: 'a' }>()
      return next()
    })

  const middleware2 = createMiddleware({ id: 'test2' })
    .middleware([middleware1])
    .input(() => {
      return {
        b: 'b',
      } as const
    })
    .use(({ input, next }) => {
      expectTypeOf(input).toEqualTypeOf<{ readonly a: 'a'; readonly b: 'b' }>
      return next()
    })

  createMiddleware({ id: 'test3' })
    .middleware([middleware2])
    .input(() => ({ c: 'c' }) as const)
    .use(({ next, input }) => {
      expectTypeOf(input).toEqualTypeOf<{
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }>
      return next()
    })
})
