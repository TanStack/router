import { describe, expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../createMiddleware'
import { createServerFn } from '../createServerFn'
import type { Constrain, Register, Validator } from '@tanstack/router-core'
import type { ConstrainValidator } from '../createServerFn'

test('createServerFn method with autocomplete', () => {
  createServerFn().handler((options) => {
    expectTypeOf(options.method).toEqualTypeOf<'GET' | 'POST'>()
  })
})

test('createServerFn without middleware', () => {
  expectTypeOf(createServerFn()).toHaveProperty('handler')
  expectTypeOf(createServerFn()).toHaveProperty('middleware')
  expectTypeOf(createServerFn()).toHaveProperty('inputValidator')

  createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: undefined
      signal: AbortSignal
    }>()
  })
})

test('createServerFn with validator', () => {
  const fnAfterValidator = createServerFn({
    method: 'GET',
  }).inputValidator((input: { input: string }) => ({
    a: input.input,
  }))

  expectTypeOf(fnAfterValidator).toHaveProperty('handler')
  expectTypeOf(fnAfterValidator).toHaveProperty('middleware')
  expectTypeOf(fnAfterValidator).not.toHaveProperty('inputValidator')

  const fn = fnAfterValidator.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: {
        a: string
      }
      signal: AbortSignal
    }>()
  })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<{
    data: { input: string }
    headers?: HeadersInit
    signal?: AbortSignal
  }>()

  expectTypeOf<ReturnType<typeof fn>>().resolves.toEqualTypeOf<void>()
})

test('createServerFn with middleware and context', () => {
  const middleware1 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { a: 'a' } as const })
    },
  )

  const middleware2 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { b: 'b' } as const })
    },
  )

  const middleware3 = createMiddleware({ type: 'function' })
    .middleware([middleware1, middleware2])
    .client(({ next }) => {
      return next({ context: { c: 'c' } as const })
    })

  const middleware4 = createMiddleware({ type: 'function' })
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
  expectTypeOf(fnWithMiddleware).toHaveProperty('inputValidator')

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
      signal: AbortSignal
    }>()
  })
})

describe('createServerFn with middleware and validator', () => {
  const middleware1 = createMiddleware({ type: 'function' }).inputValidator(
    (input: { readonly inputA: 'inputA' }) =>
      ({
        outputA: 'outputA',
      }) as const,
  )

  const middleware2 = createMiddleware({ type: 'function' }).inputValidator(
    (input: { readonly inputB: 'inputB' }) =>
      ({
        outputB: 'outputB',
      }) as const,
  )

  const middleware3 = createMiddleware({ type: 'function' }).middleware([
    middleware1,
    middleware2,
  ])

  test(`response`, () => {
    const fn = createServerFn({ method: 'GET' })
      .middleware([middleware3])
      .inputValidator(
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
          signal: AbortSignal
        }>()

        return 'some-data' as const
      })

    expectTypeOf(fn).parameter(0).toEqualTypeOf<{
      data: {
        readonly inputA: 'inputA'
        readonly inputB: 'inputB'
        readonly inputC: 'inputC'
      }
      headers?: HeadersInit
      signal?: AbortSignal
    }>()

    expectTypeOf(fn).returns.resolves.toEqualTypeOf<'some-data'>()
    expectTypeOf(() =>
      fn({
        data: { inputA: 'inputA', inputB: 'inputB', inputC: 'inputC' },
      }),
    ).returns.resolves.toEqualTypeOf<'some-data'>()
  })
})

test('createServerFn overrides properties', () => {
  const middleware1 = createMiddleware({ type: 'function' })
    .inputValidator(
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

  const middleware2 = createMiddleware({ type: 'function' })
    .middleware([middleware1])
    .inputValidator(
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

  createServerFn()
    .middleware([middleware2])
    .inputValidator(
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
    .inputValidator(() => 'c' as const)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: 'c'
        signal: AbortSignal
      }>()
    })
})

test('createServerFn where validator is optional if object is optional', () => {
  const fn = createServerFn({ method: 'GET' })
    .inputValidator((input: 'c' | undefined) => input)
    .handler((options) => {
      expectTypeOf(options).toEqualTypeOf<{
        method: 'GET'
        context: undefined
        data: 'c' | undefined
        signal: AbortSignal
      }>()
    })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<
    | {
        data?: 'c' | undefined
        headers?: HeadersInit
        signal?: AbortSignal
      }
    | undefined
  >()

  expectTypeOf<ReturnType<typeof fn>>().resolves.toEqualTypeOf<void>()
})

test('createServerFn where data is optional if there is no validator', () => {
  const fn = createServerFn({ method: 'GET' }).handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: undefined
      data: undefined
      signal: AbortSignal
    }>()
  })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<
    | {
        data?: undefined
        headers?: HeadersInit
        signal?: AbortSignal
      }
    | undefined
  >()

  expectTypeOf<ReturnType<typeof fn>>().resolves.toEqualTypeOf<void>()
})

test('createServerFn returns Date', () => {
  const fn = createServerFn().handler(() => ({
    dates: [new Date(), new Date()] as const,
  }))

  expectTypeOf(fn()).toEqualTypeOf<Promise<{ dates: readonly [Date, Date] }>>()
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
      | Response
      | { func: 'Function is not serializable' }
      | Promise<{ func: 'Function is not serializable' }>
    >()
})

test('createServerFn cannot validate function', () => {
  const validator = createServerFn().inputValidator<
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
  const validator = createServerFn().inputValidator<
    (input: Date) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .toEqualTypeOf<
      ConstrainValidator<Register, 'GET', (input: Date) => { output: 'string' }>
    >()
})

test('createServerFn can validate FormData', () => {
  const validator = createServerFn({ method: 'POST' }).inputValidator<
    (input: FormData) => { output: 'string' }
  >

  expectTypeOf(validator).parameter(0).parameter(0).toEqualTypeOf<FormData>()
})

test('createServerFn cannot validate FormData for GET', () => {
  const validator = createServerFn({ method: 'GET' }).inputValidator<
    (input: FormData) => { output: 'string' }
  >

  expectTypeOf(validator)
    .parameter(0)
    .parameter(0)
    .not.toEqualTypeOf<FormData>()
})

describe('response', () => {
  test(`client receives Response when Response is returned`, () => {
    const fn = createServerFn().handler(() => {
      return new Response('Hello World')
    })

    expectTypeOf(fn()).toEqualTypeOf<Promise<Response>>()
  })
})

test('createServerFn can be used as a mutation function', () => {
  const serverFn = createServerFn()
    .inputValidator((data: number) => data)
    .handler(() => 'foo')

  type MutationFunction<TData = unknown, TVariables = unknown> = (
    variables: TVariables,
  ) => Promise<TData>

  // simplifeid "clone" of @tansctack/react-query's useMutation
  const useMutation = <TData, TVariables>(
    fn: MutationFunction<TData, TVariables>,
  ) => {}

  useMutation(serverFn)
})

test('createServerFn validator infers unknown for default input type', () => {
  const fn = createServerFn()
    .inputValidator((input) => {
      expectTypeOf(input).toEqualTypeOf<unknown>()

      if (typeof input === 'number') return 'success' as const

      return 'failed' as const
    })
    .handler(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<'success' | 'failed'>()

      return data
    })

  expectTypeOf(fn).parameter(0).toEqualTypeOf<
    | {
        data?: unknown | undefined
        headers?: HeadersInit
        signal?: AbortSignal
      }
    | undefined
  >()

  expectTypeOf(fn()).toEqualTypeOf<Promise<'failed' | 'success'>>()
})

test('incrementally building createServerFn with multiple middleware calls', () => {
  const middleware1 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { a: 'a' } as const })
    },
  )

  const middleware2 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { b: 'b' } as const })
    },
  )

  const middleware3 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { c: 'c' } as const })
    },
  )

  const builderWithMw1 = createServerFn({ method: 'GET' }).middleware([
    middleware1,
  ])

  expectTypeOf(builderWithMw1).toHaveProperty('handler')
  expectTypeOf(builderWithMw1).toHaveProperty('inputValidator')
  expectTypeOf(builderWithMw1).toHaveProperty('middleware')

  builderWithMw1.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: {
        readonly a: 'a'
      }
      data: undefined
      signal: AbortSignal
    }>()
  })

  // overrides method
  const builderWithMw2 = builderWithMw1({ method: 'POST' }).middleware([
    middleware2,
  ])

  expectTypeOf(builderWithMw2).toHaveProperty('handler')
  expectTypeOf(builderWithMw2).toHaveProperty('inputValidator')
  expectTypeOf(builderWithMw2).toHaveProperty('middleware')

  builderWithMw2.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'POST'
      context: {
        readonly a: 'a'
        readonly b: 'b'
      }
      data: undefined
      signal: AbortSignal
    }>()
  })

  // overrides method again
  const builderWithMw3 = builderWithMw2({ method: 'GET' }).middleware([
    middleware3,
  ])

  expectTypeOf(builderWithMw3).toHaveProperty('handler')
  expectTypeOf(builderWithMw3).toHaveProperty('inputValidator')
  expectTypeOf(builderWithMw3).toHaveProperty('middleware')

  builderWithMw3.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: {
        readonly a: 'a'
        readonly b: 'b'
        readonly c: 'c'
      }
      data: undefined
      signal: AbortSignal
    }>()
  })
})

test('compose middlewares and server function factories', () => {
  const middleware1 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { a: 'a' } as const })
    },
  )

  const middleware2 = createMiddleware({ type: 'function' }).server(
    ({ next }) => {
      return next({ context: { b: 'b' } as const })
    },
  )

  const builderWithMw1 = createServerFn().middleware([middleware1])

  const composedBuilder = createServerFn({ method: 'GET' }).middleware([
    middleware2,
    builderWithMw1,
  ])

  composedBuilder.handler((options) => {
    expectTypeOf(options).toEqualTypeOf<{
      method: 'GET'
      context: {
        readonly a: 'a'
        readonly b: 'b'
      }
      data: undefined
      signal: AbortSignal
    }>()
  })
})
