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
    : TMiddlewares extends ReadonlyArray<AnyMiddleware>
      ? TMiddlewares[number] extends infer TMiddleware extends AnyMiddleware
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

export interface MiddlewareOptions<TId, TMiddlewares, TValidator, TContext> {
  validateClient?: boolean
  middleware?: TMiddlewares
  input?: Constrain<TValidator, AnyValidator>
  client?: MiddlewareClientFn<TMiddlewares, TValidator, TContext>
  server?: MiddlewareServerFn<TMiddlewares, TValidator, TContext>
}

export type MiddlewareServerFn<TMiddlewares, TValidator, TContext> = (options: {
  input: ResolveAllMiddlewareOutput<TMiddlewares, NonNullable<TValidator>>
  context: ResolveAllMiddlewareContext<TMiddlewares>
  next: <TContext>(ctx?: {
    context?: TContext
  }) => Promise<ServerResultWithContext<TContext>>
}) =>
  | Promise<ServerResultWithContext<TContext>>
  | ServerResultWithContext<TContext>

export type MiddlewareClientFn<TMiddlewares, TValidator, TContext> = (options: {
  input: ResolveAllMiddlewareInput<TMiddlewares, NonNullable<TValidator>>
  context: ResolveAllMiddlewareContext<TMiddlewares>
  next: <TContext>(ctx?: {
    context?: TContext
    serverContext?: TServerContext
    headers?: HeadersInit
  }) => Promise<ClientResultWithContext<TContext>>
}) =>
  | Promise<ClientResultWithContext<TContext>>
  | ClientResultWithContext<TContext>

export type ServerResultWithContext<TContext> = {
  'use functions must return the result of next()': true
  context: TContext
}

export type ClientResultWithContext<TContext> = {
  'use functions must return the result of next()': true
  context: TContext
  serverContext: TServerContext
  headers: HeadersInit
}

export type AnyMiddleware = MiddlewareTypes<any, any, any, any>

export interface MiddlewareTypes<TId, TMiddlewares, TValidator, TContext> {
  _types: {
    id: TId
    middleware: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    output: ResolveValidatorOutput<TValidator>
    context: TContext
  }
  options: MiddlewareOptions<TId, TMiddlewares, TValidator, TContext>
}

export interface MiddlewareInput<TId, TMiddlewares, TInput, TContext> {
  input: <TNewServerValidator>(
    input: Constrain<TNewServerValidator, AnyValidator>,
  ) => MiddlewareWithMiddleware<
    TId,
    TMiddlewares,
    NonNullable<TInput> | TNewServerValidator,
    TContext
  >
}

export interface MiddlewareServer<TId, TMiddlewares, TValidator, TContext> {
  server: <TNewContext>(
    server: MiddlewareServerFn<TMiddlewares, TValidator, TNewContext>,
  ) => MiddlewareWithServer<
    TId,
    TMiddlewares,
    TValidator,
    // Merge the current context with the new context
    NonNullable<TContext> | TNewContext
  >
}

export interface MiddlewareWithServer<TId, TMiddlewares, TValidator, TContext>
  extends MiddlewareTypes<TId, TMiddlewares, TValidator, TContext>,
    MiddlewareServer<TId, TMiddlewares, TValidator, TContext> {}

export interface MiddlewareWithMiddleware<
  TId,
  TMiddlewares,
  TValidator,
  TContext,
> extends MiddlewareWithServer<TId, TMiddlewares, TValidator, TContext>,
    MiddlewareInput<TId, TMiddlewares, TValidator, TContext> {}

export interface Middleware<TId, TMiddlewares, TValidator, TContext>
  extends MiddlewareWithMiddleware<TId, TMiddlewares, TValidator, TContext> {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareWithMiddleware<TId, TNewMiddlewares, TValidator, TContext>
}

export function createMiddleware<
  const TId,
  const TMiddlewares,
  TValidator = undefined,
  TContext = undefined,
>(
  options?: {
    validateClient?: boolean
  },
  __opts?: MiddlewareOptions<TId, TMiddlewares, TValidator, TContext>,
): Middleware<TId, TMiddlewares, TValidator, TContext> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions =
    __opts ||
    (options as MiddlewareOptions<TId, TMiddlewares, TValidator, TContext>)

  return {
    options: resolvedOptions as any,
    middleware: (middleware) => {
      return createMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    input: (input) => {
      return createMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { input }),
      ) as any
    },
    client: (client) => {
      return createMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { client }),
      ) as any
    },
    server: (server) => {
      return createMiddleware<TId, TMiddlewares, TValidator, TContext>(
        undefined,
        Object.assign(resolvedOptions, { server }),
      ) as any
    },
  } as Middleware<TId, TMiddlewares, TValidator, TContext>
}

const middleware1 = createMiddleware().server(async ({ context, next }) => {
  console.log('middleware1', context)
  const res = await next({ context: { a: true } })
  console.log('middleware1 after', res)
  return res
})

const middleware2 = createMiddleware()
  .middleware([middleware1])
  .server(({ context, next }) => {
    console.log('middleware2', context)
    return next({})
  })
