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
 * Recursively resolve the server context type produced by a sequence of middleware
 */
export type ResolveAllMiddlewareServerContext<
  TMiddlewares,
  TContext = never,
> = Expand<
  MergeAll<
    | NonNullable<ParseMiddlewares<TMiddlewares>['_types']['serverContext']>
    | TContext
  >
>

/**
 * Recursively resolve the client context type produced by a sequence of middleware
 */
export type ResolveAllMiddlewareClientContext<
  TMiddlewares,
  TContext = never,
> = Expand<
  MergeAll<
    | NonNullable<ParseMiddlewares<TMiddlewares>['_types']['clientContext']>
    | TContext
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

export interface MiddlewareOptions<
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> {
  validateClient?: boolean
  middleware?: TMiddlewares
  input?: Constrain<TValidator, AnyValidator>
  client?: MiddlewareClientFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
  server?: MiddlewareServerFn<TMiddlewares, TValidator, TServerContext, unknown>
}

export type MiddlewareServerFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TContext,
> = (options: {
  input: ResolveAllMiddlewareOutput<TMiddlewares, NonNullable<TValidator>>
  context: ResolveAllMiddlewareServerContext<
    TMiddlewares,
    NonNullable<TServerContext>
  >
  next: <TContext = undefined>(ctx?: {
    context?: TContext
  }) => Promise<ServerResultWithContext<TContext>>
}) =>
  | Promise<ServerResultWithContext<TContext>>
  | ServerResultWithContext<TContext>

export type MiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> = (options: {
  input: ResolveAllMiddlewareInput<TMiddlewares, NonNullable<TValidator>>
  context: ResolveAllMiddlewareClientContext<TMiddlewares>
  next: <TNewServerContext = undefined, TNewClientContext = undefined>(ctx?: {
    context?: TNewClientContext
    serverContext?: TNewServerContext
    headers?: HeadersInit
  }) => Promise<ClientResultWithContext<TNewServerContext, TNewClientContext>>
}) =>
  | Promise<ClientResultWithContext<TServerContext, TClientContext>>
  | ClientResultWithContext<TServerContext, TClientContext>

export type ServerResultWithContext<TContext> = {
  'use functions must return the result of next()': true
  context: TContext
}

export type ClientResultWithContext<TServerContext, TClientContext> = {
  'use functions must return the result of next()': true
  context: TClientContext
  serverContext: TServerContext
  headers: HeadersInit
}

export type AnyMiddleware = MiddlewareTypes<any, any, any, any, any>

export interface MiddlewareTypes<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> {
  _types: {
    id: TId
    middleware: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    output: ResolveValidatorOutput<TValidator>
    clientContext: TClientContext
    serverContext: TServerContext
  }
  options: MiddlewareOptions<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
}

export interface MiddlewareInput<
  TId,
  TMiddlewares,
  TInput,
  TServerContext,
  TClientContext,
> {
  input: <TNewValidator>(
    input: Constrain<TNewValidator, AnyValidator>,
  ) => MiddlewareWithMiddleware<
    TId,
    TMiddlewares,
    NonNullable<TInput> | TNewValidator,
    TServerContext,
    TClientContext
  >
}

export interface MiddlewareServer<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> {
  server: <TNewServerContext = undefined>(
    server: MiddlewareServerFn<
      TMiddlewares,
      TValidator,
      TServerContext,
      TNewServerContext
    >,
  ) => MiddlewareWithServer<
    TId,
    TMiddlewares,
    TValidator,
    // Merge the current context with the new context
    NonNullable<TServerContext> | TNewServerContext,
    TClientContext
  >
}

export interface MiddlewareWithServer<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> extends MiddlewareTypes<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    >,
    MiddlewareServer<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    > {}

export interface MiddlewareClient<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> {
  client: <TNewServerContext = undefined, TNewClientContext = undefined>(
    client: MiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TNewServerContext,
      TNewClientContext
    >,
  ) => MiddlewareWithServer<
    TId,
    TMiddlewares,
    TValidator,
    NonNullable<TServerContext> | TNewServerContext,
    NonNullable<TClientContext> | TNewClientContext
  >
}

export interface MiddlewareWithClient<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> extends MiddlewareTypes<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    >,
    MiddlewareClient<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    > {}

export interface MiddlewareWithMiddleware<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> extends MiddlewareWithServer<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    >,
    MiddlewareWithClient<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    >,
    MiddlewareInput<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    > {}

export interface Middleware<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> extends MiddlewareWithMiddleware<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  > {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareWithMiddleware<
    TId,
    TNewMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
}

export function createMiddleware<
  const TId,
  const TMiddlewares,
  TValidator = undefined,
  TServerContext = undefined,
  TClientContext = undefined,
>(
  options?: {
    validateClient?: boolean
  },
  __opts?: MiddlewareOptions<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >,
): Middleware<TId, TMiddlewares, TValidator, TServerContext, TClientContext> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions =
    __opts ||
    (options as MiddlewareOptions<
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext
    >)

  return {
    options: resolvedOptions as any,
    middleware: (middleware: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { middleware })) as any
    },
    input: (input: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { input })) as any
    },
    client: (client: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { client })) as any
    },
    server: (server: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { server })) as any
    },
  } as unknown as Middleware<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
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

const clientMiddleware1 = createMiddleware()
  .middleware([middleware2])
  .client(({ next, context }) => {
    return next({ context: { a: 'c' } as const })
  })
