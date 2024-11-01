import type { Method } from './createServerFn'
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
              TMiddleware['_types']['middlewares'],
              TAcc | TMiddleware
            >
          : TAcc
        : TAcc
      : TAcc

export type ResolveAllMiddlewareServerContext<
  TMiddlewares,
  TContext = undefined,
> = ParseMiddlewares<TMiddlewares>['_types']['serverContext'] | TContext

/**
 * Recursively resolve the server context type produced by a sequence of middleware
 */
export type MergeAllServerContext<TMiddlewares, TContext = undefined> = Expand<
  MergeAll<
    ResolveAllMiddlewareServerContext<TMiddlewares, TContext> extends undefined
      ? undefined
      : NonNullable<ResolveAllMiddlewareServerContext<TMiddlewares, TContext>>
  >
>

export type ResolveAllMiddlewareClientContext<
  TMiddlewares,
  TContext = undefined,
> = ParseMiddlewares<TMiddlewares>['_types']['clientContext'] | TContext

/**
 * Recursively resolve the client context type produced by a sequence of middleware
 */
export type MergeAllClientContext<TMiddlewares, TContext = undefined> = Expand<
  MergeAll<
    ResolveAllMiddlewareClientContext<TMiddlewares, TContext> extends undefined
      ? undefined
      : NonNullable<ResolveAllMiddlewareClientContext<TMiddlewares, TContext>>
  >
>

export type ResolveAllValidators<TMiddlewares, TValidator> =
  | ParseMiddlewares<TMiddlewares>['_types']['validator']
  | TValidator

export type ResolveAllValidatorInputs<TMiddlewares, TValidator> =
  ResolveAllValidators<TMiddlewares, TValidator> extends undefined
    ? undefined
    : ResolveValidatorInput<
        NonNullable<ResolveAllValidators<TMiddlewares, TValidator>>
      >

/**
 * Recursively resolve the input type produced by a sequence of middleware
 */
export type MergeAllValidatorInputs<TMiddlewares, TValidator> = Expand<
  MergeAll<ResolveAllValidatorInputs<TMiddlewares, TValidator>>
>

export type ResolveAllValidatorOutputs<TMiddlewares, TValidator> =
  ResolveAllValidators<TMiddlewares, TValidator> extends undefined
    ? undefined
    : ResolveValidatorOutput<
        NonNullable<ResolveAllValidators<TMiddlewares, TValidator>>
      >

/**
 * Recursively merge the output type produced by a sequence of middleware
 */
export type MergeAllValidatorOutputs<TMiddlewares, TValidator> = Expand<
  MergeAll<ResolveAllValidatorOutputs<TMiddlewares, TValidator>>
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
  input: MergeAllValidatorOutputs<TMiddlewares, NonNullable<TValidator>>
  context: MergeAllServerContext<TMiddlewares, NonNullable<TServerContext>>
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
  input: MergeAllValidatorInputs<TMiddlewares, NonNullable<TValidator>>
  context: MergeAllClientContext<TMiddlewares>
  serverContext?: unknown // cc Chris Horobin
  method: Method
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
    middlewares: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    output: ResolveValidatorOutput<TValidator>
    clientContext: TClientContext
    serverContext: TServerContext
    validator: TValidator
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
  ) => MiddlewareWithClientAndServer<
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
    TServerContext | TNewServerContext,
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
    TServerContext | TNewServerContext,
    TClientContext | TNewClientContext
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

export interface MiddlewareWithClientAndServer<
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

export interface MiddlewareWithAll<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> extends MiddlewareWithClientAndServer<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  > {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareWithClientAndServer<
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
): MiddlewareWithAll<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext
> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions =
    __opts ||
    ((options || {}) as MiddlewareOptions<
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
  } as unknown as MiddlewareWithAll<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
}

const middleware1 = createMiddleware()
  .client((ctx) => {
    return ctx.next({
      context: {
        client: 'client',
      },
      serverContext: { clientServer: 'clientServer' },
    })
  })
  .server(async ({ context, next }) => {
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
