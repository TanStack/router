import { test, expectTypeOf } from 'vitest'
import { createServerMiddleware } from '../createServerMiddleware'

test('createServerMiddleware', () => {
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
  })
    .middleware([middleware1])
    .use(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean }>()
      return next({ context: { b: 'test' } })
    })

  createServerMiddleware({
    id: 'test3',
  })
    .middleware([middleware2])
    .use(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ a: boolean; b: string }>()
      return next({ context: { c: 5 } })
    })
})
