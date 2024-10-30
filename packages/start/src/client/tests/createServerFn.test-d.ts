import { expectTypeOf, test } from 'vitest'
import { createServerFn } from '../createServerFn'
import { createMiddleware } from '../createMiddleware'

test('createServerFn without middleware', () => {
  createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      input: undefined
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
        context: undefined
        input: {
          a: string
        }
      }>()
    })
})

test('createServerFn with middleware and context', () => {
  const middleware1 = createMiddleware().server(({ next }) => {
    return next({ context: { a: 'a' } as const })
  })

  const middleware2 = createMiddleware().server(({ next }) => {
    return next({ context: { b: 'b' } as const })
  })

  const middleware3 = createMiddleware()
    .middleware([middleware1, middleware2])
    .client(({ next }) => {
      return next({ context: { c: 'c' } as const })
    })

  const middleware4 = createMiddleware()
    .middleware([middleware3])
    .client(({ context, next }) => {
      return next({ serverContext: context })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }>()
      return next({ context: { d: 'd' } as const })
    })

  createServerFn({ method: 'GET' })
    .middleware([middleware4])
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: {
          readonly a: 'a'
          readonly b: 'b'
          readonly c: 'c'
          readonly d: 'd'
        }
        input: undefined
      }>()
    })
})

test('createServerFn with middleware and input', async () => {
  const middleware1 = createMiddleware().input(
    () =>
      ({
        a: 'a',
      }) as const,
  )

  const middleware2 = createMiddleware().input(
    () =>
      ({
        b: 'b',
      }) as const,
  )

  const middleware3 = createMiddleware().middleware([middleware1, middleware2])

  const fn = createServerFn({ method: 'GET' })
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
        context: undefined
        input: {
          readonly a: 'a'
          readonly b: 'b'
          readonly c: 'c'
        }
      }>()

      return 'data' as const
    })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<{
    data: {
      readonly a: 'a'
      readonly b: 'b'
      readonly c: 'c'
    }
    headers?: HeadersInit
  }>()

  expectTypeOf(fn).returns.resolves.toEqualTypeOf<'data'>()
})

test('createServerFn where input is a primitive', () => {
  createServerFn({ method: 'GET' })
    .input(() => 'c' as const)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        input: 'c'
      }>()
    })
})

test('createServerFn where input is optional if object is optional', () => {
  const fn = createServerFn({ method: 'GET' })
    .input(() => 'c' as 'c' | undefined)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        input: 'c' | undefined
      }>()
    })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<
    | {
        data?: 'c' | undefined
        headers?: HeadersInit
      }
    | undefined
  >()
})

test('createServerFn where input is optional if there is no input', () => {
  const fn = createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      input: undefined
    }>()
  })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<
    | {
        data?: undefined
        headers?: HeadersInit
      }
    | undefined
  >()
})
