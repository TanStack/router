import type {
  AnyValidator,
  Constrain,
  Expand,
  MergeAll,
  ResolveValidatorInput,
  ResolveValidatorOutput,
} from '@tanstack/react-router'

/**
 * Turns all middleware into a union
 */
export type ParseMiddlewares<
  TMiddlewares,
  TAcc = never,
> = unknown extends TMiddlewares
  ? TAcc
  : [] extends TMiddlewares
    ? TAcc
    : TMiddlewares extends ReadonlyArray<AnyServerMiddleware>
      ? TMiddlewares[number] extends infer TMiddleware extends
          AnyServerMiddleware
        ? TMiddleware extends any
          ? ParseMiddlewares<
              TMiddleware['_types']['middleware'],
              TAcc | TMiddleware
            >
          : TAcc
        : TAcc
      : TAcc

/**
 * Recursively resolve the context type produced by a sequence of middleware
 */
export type ResolveAllMiddlewareContext<
  TMiddlewares,
  TContext = never,
> = Expand<
  MergeAll<
    NonNullable<ParseMiddlewares<TMiddlewares>['_types']['context']> | TContext
  >
>

/**
 * Recursively resolve the input type produced by a sequence of middleware
 */
export type ResolveAllMiddlewareInput<TMiddlewares, TValidator> = Expand<
  MergeAll<
    | ParseMiddlewares<TMiddlewares>['_types']['input']
    | ResolveValidatorInput<TValidator>
  >
>

/**
 * Recursively resolve the output type produced by a sequence of middleware
 */
export type ResolveAllMiddlewareOutput<TMiddlewares, TValidator> = Expand<
  MergeAll<
    | ParseMiddlewares<TMiddlewares>['_types']['output']
    | ResolveValidatorOutput<TValidator>
  >
>

export interface ServerMiddlewareOptions<
  TId,
  TMiddlewares,
  TValidator,
  TContext,
> {
  middleware?: TMiddlewares
  input?: Constrain<TValidator, AnyValidator>
  useFn?: ServerMiddlewareUseFn<TMiddlewares, TValidator, TContext>
}

export type ServerMiddlewareUseFn<TMiddlewares, TValidator, TContext> =
  (options: {
    input: ResolveAllMiddlewareOutput<TMiddlewares, NonNullable<TValidator>>
    context: ResolveAllMiddlewareContext<TMiddlewares>
    next: <TContext>(ctx?: {
      context: TContext
    }) => Promise<ResultWithContext<TContext>>
  }) => Promise<ResultWithContext<TContext>> | ResultWithContext<TContext>

export type ResultWithContext<TContext> = {
  'use functions must return the result of next()': true
  context: TContext
}

export type AnyServerMiddleware = ServerMiddlewareTypes<any, any, any, any>

export interface ServerMiddlewareTypes<
  TId,
  TMiddlewares,
  TValidator,
  TContext,
> {
  _types: {
    id: TId
    middleware: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    output: ResolveValidatorOutput<TValidator>
    context: TContext
  }
  options: ServerMiddlewareOptions<TId, TMiddlewares, TValidator, TContext>
}

export interface ServerMiddlewareInput<TId, TMiddlewares, TInput, TContext> {
  input: <TNewServerValidator>(
    input: Constrain<TNewServerValidator, AnyValidator>,
  ) => ServerMiddlewareWithMiddleware<
    TId,
    TMiddlewares,
    NonNullable<TInput> | TNewServerValidator,
    TContext
  >
}

export interface ServerMiddlewareUse<TId, TMiddlewares, TValidator, TContext> {
  use: <TNewContext>(
    useFn: ServerMiddlewareUseFn<TMiddlewares, TValidator, TNewContext>,
  ) => ServerMiddlewareWithUse<
    TId,
    TMiddlewares,
    TValidator,
    // Merge the current context with the new context
    NonNullable<TContext> | TNewContext
  >
}

export interface ServerMiddlewareWithUse<
  TId,
  TMiddlewares,
  TValidator,
  TContext,
> extends ServerMiddlewareTypes<TId, TMiddlewares, TValidator, TContext>,
    ServerMiddlewareUse<TId, TMiddlewares, TValidator, TContext> {}

export interface ServerMiddlewareWithMiddleware<
  TId,
  TMiddlewares,
  TValidator,
  TContext,
> extends ServerMiddlewareWithUse<TId, TMiddlewares, TValidator, TContext>,
    ServerMiddlewareInput<TId, TMiddlewares, TValidator, TContext> {}

export interface ServerMiddleware<TId, TMiddlewares, TValidator, TContext>
  extends ServerMiddlewareWithMiddleware<
    TId,
    TMiddlewares,
    TValidator,
    TContext
  > {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyServerMiddleware>>,
  ) => ServerMiddlewareWithMiddleware<
    TId,
    TNewMiddlewares,
    TValidator,
    TContext
  >
}

export function createServerMiddleware<
  const TId,
  const TMiddlewares,
  TValidator = undefined,
  TContext = undefined,
>(
  __?: never,
  __opts?: ServerMiddlewareOptions<TId, TMiddlewares, TValidator, TContext>,
): ServerMiddleware<TId, TMiddlewares, TValidator, TContext> {
  // const resolvedOptions = (__opts || options) as ServerMiddlewareOptions<
  const resolvedOptions = __opts as ServerMiddlewareOptions<
    TId,
    TMiddlewares,
    TValidator,
    TContext
  >

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createServerMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    input: (input) => {
      return createServerMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { input }),
      ) as any
    },
    // eslint-disable-next-line @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks
    use: (useFn) => {
      return createServerMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { useFn }),
      ) as any
    },
  } as ServerMiddleware<TId, TMiddlewares, TValidator, TContext>
}

const middleware1 = createServerMiddleware().use(async ({ context, next }) => {
  console.log('middleware1', context)
  const res = await next({ context: { a: true } })
  console.log('middleware1 after', res)
  return res
})

const middleware2 = createServerMiddleware()
  .middleware([middleware1])
  .use(({ context, next }) => {
    console.log('middleware2', context)
    return next({ context: {} })
  })
