import { expectTypeOf, test } from 'vitest'
import { createServerFn } from '../createServerFn'
import { createMiddleware } from '../createMiddleware'

test('createServerFn without middleware', () => {
  createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: undefined
    }>()
  })
})

test('createServerFn with validator', () => {
  createServerFn({ method: 'GET' })
    .validator(() => ({
      a: 'a',
    }))
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: {
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
      return next({ sendContext: context })
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
        data: undefined
      }>()
    })
})

test('createServerFn with middleware and validator', () => {
  const middleware1 = createMiddleware().validator(
    () =>
      ({
        a: 'a',
      }) as const,
  )

  const middleware2 = createMiddleware().validator(
    () =>
      ({
        b: 'b',
      }) as const,
  )

  const middleware3 = createMiddleware().middleware([middleware1, middleware2])

  const fn = createServerFn({ method: 'GET' })
    .middleware([middleware3])
    .validator(
      () =>
        ({
          c: 'c',
        }) as const,
    )
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: {
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

test('createServerFn where validator is a primitive', () => {
  createServerFn({ method: 'GET' })
    .validator(() => 'c' as const)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: 'c'
      }>()
    })
})

test('createServerFn where validator is optional if object is optional', () => {
  const fn = createServerFn({ method: 'GET' })
    .validator(() => 'c' as 'c' | undefined)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: 'c' | undefined
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

test('createServerFn where data is optional if there is no validator', () => {
  const fn = createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: undefined
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

test('createServerFn returns Date', () => {
  const fn = createServerFn().handler(() => ({
    dates: [new Date(), new Date()] as const,
  }))

  expectTypeOf(fn()).toEqualTypeOf<Promise<{ dates: readonly [Date, Date] }>>()
})

test('createServerFn returns RSC', () => {
  const fn = createServerFn().handler(() => ({
    rscs: [<div>I'm an RSC</div>, <div>I'm an RSC</div>] as const,
  }))

  expectTypeOf(fn()).toEqualTypeOf<
    Promise<{ rscs: readonly [ReadableStream, ReadableStream] }>
  >()
})

test('createServerFn returns undefined', () => {
  const fn = createServerFn().handler(() => ({
    nothing: undefined,
  }))

  expectTypeOf(fn()).toEqualTypeOf<Promise<{ nothing: undefined }>>()
})

test('createServerFn cannot return function', () => {
  expectTypeOf(createServerFn().handler<{ func: () => 'func' }>)
    .parameter(0)
    .returns.toEqualTypeOf<
      | { func: 'Function is not serializable' }
      | Promise<{ func: 'Function is not serializable' }>
    >()
})
