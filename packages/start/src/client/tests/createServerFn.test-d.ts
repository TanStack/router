import { expectTypeOf, test } from 'vitest'
import { createServerFn } from '../createServerFn'
import { createServerMiddleware } from '../createServerMiddleware'

test('createServerFn without middleware', () => {
  createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: {}
      input: {}
    }>()
  })
})

test('createServerFn with input', () => {
  createServerFn({ method: 'GET' })
    .input(() => ({
      a: 'a',
    }))
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: {}
        input: {
          a: string
        }
      }>()
    })
})

test('createServerFn with middleware and context', () => {
  const middleware1 = createServerMiddleware({ id: 'middleware1' }).use(
    ({ next }) => {
      return next({ context: { a: 'a' } as const })
    },
  )

  const middleware2 = createServerMiddleware({ id: 'middleware2' }).use(
    ({ next }) => {
      return next({ context: { b: 'b' } as const })
    },
  )

  const middleware3 = createServerMiddleware({ id: 'middleware3' }).middleware([
    middleware1,
    middleware2,
  ])

  createServerFn({ method: 'GET' })
    .middleware([middleware3])
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: {
          readonly a: 'a'
          readonly b: 'b'
        }
        input: {}
      }>()
    })
})

test('createServerFn with middleware and input', () => {
  const middleware1 = createServerMiddleware({ id: 'middleware1' }).input(
    () =>
      ({
        a: 'a',
      }) as const,
  )

  const middleware2 = createServerMiddleware({ id: 'middleware2' }).input(
    () =>
      ({
        b: 'b',
      }) as const,
  )

  const middleware3 = createServerMiddleware({ id: 'middleware3' }).middleware([
    middleware1,
    middleware2,
  ])

  createServerFn({ method: 'GET' })
    .middleware([middleware3])
    .input(
      () =>
        ({
          c: 'c',
        }) as const,
    )
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: {}
        input: {
          readonly a: 'a'
          readonly b: 'b'
          readonly c: 'c'
        }
      }>()
    })
})
