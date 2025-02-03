import { expectTypeOf, test } from 'vitest'
import { createServerFn } from '../createServerFn'
import { createMiddleware } from '../createMiddleware'
import type { Constrain, Validator } from '@tanstack/react-router'

test('createServerFn method with autocomplete', () => {
  createServerFn().handler((options) => {
    expectTypeOf(options.method).toEqualTypeOf<'GET' | 'POST'>()
  })
})

test('createServerFn without middleware', () => {
  expectTypeOf(createServerFn()).toHaveProperty('handler')
  expectTypeOf(createServerFn()).toHaveProperty('middleware')
  expectTypeOf(createServerFn()).toHaveProperty('validator')

  createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: undefined
    }>()
  })
})

test('createServerFn with validator', () => {
  const fnAfterValidator = createServerFn({ method: 'GET' }).validator(
    (input: { input: string }) => ({
      a: input.input,
    }),
  )

  expectTypeOf(fnAfterValidator).toHaveProperty('handler')
  expectTypeOf(fnAfterValidator).toHaveProperty('middleware')
  expectTypeOf(fnAfterValidator).not.toHaveProperty('validator')

  const fn = fnAfterValidator.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: {
        a: string
      }
    }>()
  })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<{
    data: { input: string }
    headers?: HeadersInit
  }>()
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

  const fnWithMiddleware = createServerFn({ method: 'GET' }).middleware([
    middleware4,
  ])

  expectTypeOf(fnWithMiddleware).toHaveProperty('handler')
  expectTypeOf(fnWithMiddleware).toHaveProperty('validator')
  expectTypeOf(fnWithMiddleware).not.toHaveProperty('middleware')

  fnWithMiddleware.handler((options) => {
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
    (input: { readonly inputA: 'inputA' }) =>
      ({
        outputA: 'outputA',
      }) as const,
  )

  const middleware2 = createMiddleware().validator(
    (input: { readonly inputB: 'inputB' }) =>
      ({
        outputB: 'outputB',
      }) as const,
  )

  const middleware3 = createMiddleware().middleware([middleware1, middleware2])

  const fn = createServerFn({ method: 'GET' })
    .middleware([middleware3])
    .validator(
      (input: { readonly inputC: 'inputC' }) =>
        ({
          outputC: 'outputC',
        }) as const,
    )
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: {
          readonly outputA: 'outputA'
          readonly outputB: 'outputB'
          readonly outputC: 'outputC'
        }
      }>()

      return 'data' as const
    })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<{
    data: {
      readonly inputA: 'inputA'
      readonly inputB: 'inputB'
      readonly inputC: 'inputC'
    }
    headers?: HeadersInit
  }>()

  expectTypeOf(fn).returns.resolves.toEqualTypeOf<'data'>()
})

test('createServerFn overrides properties', () => {
  const middleware1 = createMiddleware()
    .validator(
      () =>
        ({
          input: 'a' as 'a' | 'b' | 'c',
        }) as const,
    )
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<undefined>()

      const newContext = { context: 'a' } as const
      return next({ sendContext: newContext, context: newContext })
    })
    .server(({ data, context, next }) => {
      expectTypeOf(data).toEqualTypeOf<{ readonly input: 'a' | 'b' | 'c' }>()

      expectTypeOf(context).toEqualTypeOf<{
        readonly context: 'a'
      }>()

      const newContext = { context: 'b' } as const
      return next({ sendContext: newContext, context: newContext })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{
        readonly context: 'b'
      }>

      const newContext = { context: 'c' } as const
      return next({ context: newContext })
    })

  const middleware2 = createMiddleware()
    .middleware([middleware1])
    .validator(
      () =>
        ({
          input: 'b' as 'b' | 'c',
        }) as const,
    )
    .client(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ readonly context: 'a' }>()

      const newContext = { context: 'aa' } as const

      return next({ sendContext: newContext, context: newContext })
    })
    .server(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ readonly context: 'aa' }>()

      const newContext = { context: 'bb' } as const

      return next({ sendContext: newContext, context: newContext })
    })
    .clientAfter(({ context, next }) => {
      expectTypeOf(context).toEqualTypeOf<{ readonly context: 'bb' }>()

      const newContext = { context: 'cc' } as const

      return next({ context: newContext })
    })

  createServerFn()
    .middleware([middleware2])
    .validator(
      () =>
        ({
          input: 'c',
        }) as const,
    )
    .handler(({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<{
        readonly input: 'c'
      }>()
      expectTypeOf(context).toEqualTypeOf<{ readonly context: 'bb' }>()
    })
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
    .validator((input: 'c' | undefined) => input)
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
    rscs: [
      <div key="0">I'm an RSC</div>,
      <div key="1">I'm an RSC</div>,
    ] as const,
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

test('createServerFn cannot validate function', () => {
  const validator = createServerFn().validator<
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

test('createServerFn can validate Date', () => {
  const validator = createServerFn().validator<
    (input: Date) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .toEqualTypeOf<
      Constrain<(input: Date) => { output: 'string' }, Validator<Date, any>>
    >()
})

test('createServerFn can validate FormData', () => {
  const validator = createServerFn().validator<
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
