import type { ResolveServerValidatorInput } from './createServerFn'
import type {
  AnySearchValidator,
  SearchValidator,
} from '@tanstack/react-router'

export type FlattenMiddleware<TMiddlewares> = TMiddlewares extends []
  ? []
  : TMiddlewares extends [infer TFirst, ...infer TRest]
    ? [
        ...FlattenMiddleware<ExtractMiddleware<TFirst>>,
        TFirst,
        ...FlattenMiddleware<TRest>,
      ]
    : []

export type ExtractMiddleware<TMiddleware> =
  TMiddleware extends ServerMiddleware<infer TMiddlewares> ? TMiddlewares : []

// Recursively resolve the context type produced by a sequence of middleware
export type ResolveMiddlewareContext<TMiddlewares> =
  ResolveMiddlewareContextInner<FlattenMiddleware<TMiddlewares>>

export type ResolveMiddlewareContextInner<TMiddlewares> = TMiddlewares extends [
  infer TFirst,
  ...infer TRest,
]
  ? ExtractContext<TFirst> &
      (TRest extends [] ? {} : ResolveMiddlewareContextInner<TRest>)
  : {}

// Define a utility type to extract the output context from a middleware function
export type ExtractContext<TMiddleware> =
  TMiddleware extends ServerMiddleware<any, any, infer TContext>
    ? TContext
    : never

export type testMiddleware = [
  ServerMiddleware<
    [
      ServerMiddleware<
        [ServerMiddleware<[], () => string, { a: boolean }>],
        () => string,
        { b: number }
      >,
      ServerMiddleware<[], () => string, { c: boolean }>,
    ],
    () => string,
    { d: string }
  >,
  ServerMiddleware<[], () => string, { e: number }>,
]

type testFlat = FlattenMiddleware<testMiddleware>
type testResolved = ResolveMiddlewareContext<testMiddleware>

export type ServerMiddlewarePreFn<TContextIn, TContextOut> = (options: {
  context: TContextIn
}) =>
  | ServerMiddlewarePreFnReturn<TContextOut>
  | Promise<ServerMiddlewarePreFnReturn<TContextOut>>

export type ServerMiddlewarePreFnReturn<TContextOut> = {
  context: TContextOut
}

export type ServerMiddlewarePostFn<TContextOut> = (options: {
  context: TContextOut
}) => void

export type MiddlewareOptions<
  TId,
  TContextOut,
  TMiddlewares extends Array<AnyServerMiddleware> = any,
> = {
  id: TId
  middleware?: TMiddlewares
  before?: ServerMiddlewarePreFn<
    ResolveMiddlewareContext<TMiddlewares>,
    TContextOut
  >
  after?: ServerMiddlewarePostFn<TContextOut>
}

export type ServerMiddlewareOptions<
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
> = {
  middleware?: TMiddlewares
  input?: TInput
  useFn?: ServerMiddlewareUseFn<TMiddlewares, TInput, TContext>
}

export type ServerMiddlewareUseFn<
  TMiddlewares extends Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator,
  TContext,
  TResult = unknown,
> = (options: {
  data: ResolveServerValidatorInput<TInput>
  context: ResolveMiddlewareContext<TMiddlewares>
  next: <TContext>(opts?: {
    context: TContext
  }) => Promise<ResultWithContext<TContext>>
}) => Promise<ResultWithContext<TContext>> | ResultWithContext<TContext>

export type ResultWithContext<TContext> = {
  'use functions must return the result of next()': true
  context: TContext
}

export type AnyServerMiddleware = Partial<ServerMiddleware<any, any, any>>

type ServerMiddleware<
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
> = {
  options: ServerMiddlewareOptions<TMiddlewares, TInput, TContext>
  middleware: <TNewMiddlewares extends Array<AnyServerMiddleware>>(
    middlewares: TNewMiddlewares,
  ) => Pick<
    ServerMiddleware<TNewMiddlewares, TInput, TContext>,
    'input' | 'use'
  >
  input: <TNewServerValidator extends AnySearchValidator>(
    input: TNewServerValidator,
  ) => Pick<
    ServerMiddleware<TMiddlewares, TInput & TNewServerValidator, TContext>,
    'input' | 'use'
  >
  use: <TNewContext>(
    useFn: ServerMiddlewareUseFn<TMiddlewares, TInput, TNewContext>,
  ) => Pick<
    ServerMiddleware<
      TMiddlewares,
      TInput,
      // Merge the current context with the new context
      TContext & TNewContext
    >,
    'use'
  >
}

export function createServerMiddleware<
  TId,
  TMiddlewares extends Array<AnyServerMiddleware> = Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
>(
  options: {
    id: TId
  },
  _?: never,
  __opts?: ServerMiddlewareOptions<TMiddlewares, TInput, TContext>,
): ServerMiddleware<TMiddlewares, TInput, TContext> {
  return {
    options: options as any,
    middleware: (middleware) => {
      return createServerMiddleware<TId, TMiddlewares, TInput, TContext>(
        options,
        undefined,
        {
          ...(__opts as any),
          middleware,
        },
      ) as any
    },
    input: (input) => {
      return createServerMiddleware<TId, TMiddlewares, TInput, TContext>(
        options,
        undefined,
        {
          ...(__opts as any),
          input,
        },
      ) as any
    },
    // eslint-disable-next-line @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks
    use: (useFn) => {
      return createServerMiddleware<TId, TMiddlewares, TInput, TContext>(
        options,
        undefined,
        {
          ...(__opts as any),
          useFn,
        },
      ) as any
    },
  }
}

const middleware1 = createServerMiddleware({
  id: 'test1',
}).use(async ({ context, next }) => {
  console.log('middleware1', context)
  const res = await next({ context: { a: true } })
  console.log('middleware1 after', res)
  return res
})

const middleware2 = createServerMiddleware({
  id: 'test2',
})
  .middleware([middleware1])
  .use(({ context, next }) => {
    console.log('middleware2', context)
    return next({ context: {} })
  })
