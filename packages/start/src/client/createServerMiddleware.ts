import type { ResolveServerValidatorInput } from './createServerFn'
import type {
  AnySearchValidator,
  SearchValidator,
} from '@tanstack/react-router'

/**
 * To be added to router types
 */
type UnionToIntersection<T> = (
  T extends any ? (arg: T) => any : never
) extends (arg: infer T) => any
  ? T
  : never

/**
 * To be added to router types
 * Merges everything in a union into one object.
 * This mapped type is homomorphic which means it preserves stuff! :)
 */
type MergeAll<T> = {
  [TKey in keyof UnionToIntersection<T>]: T extends any
    ? T[TKey & keyof T]
    : never
}

/**
 * Turns all middleware into a union
 */
export type ParseMiddlewares<
  TMiddlewares extends Array<AnyServerMiddleware>,
  TAcc extends AnyServerMiddleware = never,
  TMiddleware extends AnyServerMiddleware = TMiddlewares[number],
> = unknown extends TMiddleware
  ? TAcc
  : TMiddlewares['length'] extends 0
    ? TAcc
    : TMiddleware extends any
      ? ParseMiddlewares<
          NonNullable<TMiddleware['_types']>['middleware'],
          TAcc | TMiddleware
        >
      : TAcc

/**
 * Recursively resolve the context type produced by a sequence of middleware
 */
export type ResolveMiddlewareContext<
  TMiddlewares extends Array<AnyServerMiddleware>,
> =
  ParseMiddlewares<TMiddlewares> extends infer TMiddleware extends
    AnyServerMiddleware
    ? MergeAll<NonNullable<TMiddleware['_types']>['context']>
    : never

export type testMiddleware = [
  ServerMiddleware<
    'id1',
    [
      ServerMiddleware<
        'id2',
        [ServerMiddleware<'id5', [], () => string, { a: boolean }>],
        () => string,
        { b: number }
      >,
      ServerMiddleware<'id3', [], () => string, { c: boolean }>,
    ],
    () => string,
    { d: string }
  >,
  ServerMiddleware<'id4', [], () => string, { e: number }>,
]

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

export interface MiddlewareOptions<
  TId,
  TContextOut,
  TMiddlewares extends Array<AnyServerMiddleware> = any,
> {
  id: TId
  middleware?: TMiddlewares
  before?: ServerMiddlewarePreFn<
    ResolveMiddlewareContext<TMiddlewares>,
    TContextOut
  >
  after?: ServerMiddlewarePostFn<TContextOut>
}

export interface ServerMiddlewareOptions<
  TId,
  TMiddlewares extends Array<AnyServerMiddleware> = [],
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
> extends MiddlewareOptions<TId, TContext, TMiddlewares> {
  input?: TInput
  useFn?: ServerMiddlewareUseFn<TMiddlewares, TInput, TContext>
}

export type ServerMiddlewareUseFn<
  TMiddlewares extends Array<AnyServerMiddleware>,
  TInput extends AnySearchValidator,
  TContext,
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

export type AnyServerMiddleware = Partial<ServerMiddleware<any, any, any, any>>

type ServerMiddleware<
  TId,
  TMiddlewares extends Array<AnyServerMiddleware> = [],
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
> = {
  _types: {
    id: TId
    middleware: TMiddlewares
    input: TInput
    context: TContext
  }
  options: ServerMiddlewareOptions<TId, TMiddlewares, TInput, TContext>
  middleware: <TNewMiddlewares extends Array<AnyServerMiddleware>>(
    middlewares: TNewMiddlewares,
  ) => Pick<
    ServerMiddleware<TId, TNewMiddlewares, TInput, TContext>,
    'input' | 'use' | '_types'
  >
  input: <TNewServerValidator extends AnySearchValidator>(
    input: TNewServerValidator,
  ) => Pick<
    ServerMiddleware<TId, TMiddlewares, TInput & TNewServerValidator, TContext>,
    'input' | 'use' | '_types'
  >
  use: <TNewContext>(
    useFn: ServerMiddlewareUseFn<TMiddlewares, TInput, TNewContext>,
  ) => Pick<
    ServerMiddleware<
      TId,
      TMiddlewares,
      TInput,
      // Merge the current context with the new context
      TContext & TNewContext
    >,
    'use' | '_types'
  >
}

export function createServerMiddleware<
  TId,
  TMiddlewares extends Array<AnyServerMiddleware> = [],
  TInput extends AnySearchValidator = SearchValidator<unknown, unknown>,
  TContext = unknown,
>(
  options: {
    id: TId
  },
  _?: never,
  __opts?: ServerMiddlewareOptions<TId, TMiddlewares, TInput, TContext>,
): ServerMiddleware<TId, TMiddlewares, TInput, TContext> {
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
  } as ServerMiddleware<TId, TMiddlewares, TInput, TContext>
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
