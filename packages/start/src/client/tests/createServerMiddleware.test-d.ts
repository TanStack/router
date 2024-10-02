import { expectTypeOf, test } from 'vitest'
import { createServerMiddleware } from '../createServerMiddleware'

test('createServeMiddleware removes middleware and input', () => {
  const middleware = createServerMiddleware({
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

test('createServerMiddleware merges context', () => {
  const middleware1 = createServerMiddleware({
    id: 'test1',
  }).use(async ({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<{}>
    expectTypeOf(await next({ context: { a: true } })).toEqualTypeOf<{
      'use functions must return the result of next()': true
      context: { a: boolean }
    }>()
    return await next({ context: { a: true } })
  })

  const middleware2 = createServerMiddleware({
    id: 'test2',
  }).use(({ context, next }) => {
    expectTypeOf(context).toEqualTypeOf<{}>()
    return next({ context: { b: 'test' } })
  })

  const middleware3 = createServerMiddleware({
    id: 'test3',
  })
    .middleware([middleware1, middleware2])
    .use(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean; b: string }>()
      return next({ context: { c: 0 } })
    })

  createServerMiddleware({
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

test('createServerMiddleware merges input', () => {
  const middleware1 = createServerMiddleware({ id: 'test1' })
    .input(() => {
      return {
        a: 'a',
      } as const
    })
    .use(({ data, next }) => {
      expectTypeOf(data).toEqualTypeOf<{ readonly a: 'a' }>()
      return next()
    })

  const middleware2 = createServerMiddleware({ id: 'test2' })
    .middleware([middleware1])
    .input(() => {
      return {
        b: 'b',
      } as const
    })
    .use(({ data, next }) => {
      expectTypeOf(data).toEqualTypeOf<{ readonly a: 'a'; readonly b: 'b' }>
      return next()
    })

  createServerMiddleware({ id: 'test3' })
    .middleware([middleware2])
    .input(() => ({ c: 'c' }) as const)
    .use(({ next, data }) => {
      expectTypeOf(data).toEqualTypeOf<{
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }>
      return next()
    })
})
