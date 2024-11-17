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

export type ResolveAllMiddlewareClientAfterContext<
  TMiddlewares,
  TContext = undefined,
> =
  | ParseMiddlewares<TMiddlewares>['_types']['clientContext']
  | ParseMiddlewares<TMiddlewares>['_types']['clientAfterContext']
  | TContext

export type MergeAllClientAfterContext<
  TMiddlewares,
  TClientContext = undefined,
  TClientAfterContext = undefined,
> = Expand<
  MergeAll<
    ResolveAllMiddlewareClientAfterContext<
      TMiddlewares,
      TClientContext | TClientAfterContext
    > extends undefined
      ? undefined
      : NonNullable<
          ResolveAllMiddlewareClientAfterContext<
            TMiddlewares,
            TClientContext | TClientAfterContext
          >
        >
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
  validator?: Constrain<TValidator, AnyValidator>
  client?: MiddlewareClientFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
  server?: MiddlewareServerFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown
  >
  clientAfter?: MiddlewareClientAfterFn<
    TMiddlewares,
    TValidator,
    TClientContext,
    unknown,
    unknown
  >
}

export type MiddlewareServerFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TNewServerContext,
  TNewClientAfterContext,
> = (options: {
  data: MergeAllValidatorOutputs<TMiddlewares, NonNullable<TValidator>>
  context: MergeAllServerContext<TMiddlewares, NonNullable<TServerContext>>
  next: <
    TNewServerContext = undefined,
    TNewClientAfterContext = undefined,
  >(ctx?: {
    context?: TNewServerContext
    sendContext?: TNewClientAfterContext
  }) => Promise<
    ServerResultWithContext<TNewServerContext, TNewClientAfterContext>
  >
}) =>
  | Promise<ServerResultWithContext<TNewServerContext, TNewClientAfterContext>>
  | ServerResultWithContext<TNewServerContext, TNewClientAfterContext>

export type MiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> = (options: {
  data: MergeAllValidatorInputs<TMiddlewares, NonNullable<TValidator>>
  context: MergeAllClientContext<TMiddlewares>
  sendContext?: unknown // cc Chris Horobin
  method: Method
  next: <TNewServerContext = undefined, TNewClientContext = undefined>(ctx?: {
    context?: TNewClientContext
    sendContext?: TNewServerContext
    headers?: HeadersInit
  }) => Promise<ClientResultWithContext<TNewServerContext, TNewClientContext>>
}) =>
  | Promise<ClientResultWithContext<TServerContext, TClientContext>>
  | ClientResultWithContext<TServerContext, TClientContext>

export type MiddlewareClientAfterFn<
  TMiddlewares,
  TValidator,
  TClientContext,
  TClientAfterContext,
  TNewClientAfterContext,
> = (options: {
  data: MergeAllValidatorInputs<TMiddlewares, NonNullable<TValidator>>
  context: MergeAllClientAfterContext<
    TMiddlewares,
    TClientContext,
    TClientAfterContext
  >
  method: Method
  next: <TNewClientAfterContext = undefined>(ctx?: {
    context?: TNewClientAfterContext
    sendContext?: never
    headers?: HeadersInit
  }) => Promise<ClientAfterResultWithContext<TNewClientAfterContext>>
}) =>
  | Promise<ClientAfterResultWithContext<TNewClientAfterContext>>
  | ClientAfterResultWithContext<TNewClientAfterContext>

export type ServerResultWithContext<TContext, TClientAfterContext> = {
  'use functions must return the result of next()': true
  context: TContext
  clientAfterContext: TClientAfterContext
}

export type ClientAfterResultWithContext<TClientContext> = {
  'use functions must return the result of next()': true
  context: TClientContext
  headers: HeadersInit
}

export type ClientResultWithContext<TServerContext, TClientContext> = {
  'use functions must return the result of next()': true
  context: TClientContext
  serverContext: TServerContext
  headers: HeadersInit
}

export type AnyMiddleware = MiddlewareTypes<any, any, any, any, any, any>

export interface MiddlewareTypes<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  _types: {
    id: TId
    middlewares: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    output: ResolveValidatorOutput<TValidator>
    clientContext: TClientContext
    serverContext: TServerContext
    clientAfterContext: TClientAfterContext
    validator: TValidator
  }
  options: MiddlewareOptions<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
}

export interface MiddlewareValidator<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  validator: <TNewValidator extends AnyValidator>(
    input: TNewValidator,
  ) => MiddlewareAfterMiddleware<
    TId,
    TMiddlewares,
    NonNullable<TValidator> | TNewValidator,
    TServerContext,
    TClientContext,
    TClientAfterContext
  >
}

export interface MiddlewareClientAfter<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  clientAfter: <TNewClientAfterContext = undefined>(
    clientAfter: MiddlewareClientAfterFn<
      TMiddlewares,
      TValidator,
      TClientContext,
      TClientAfterContext,
      TNewClientAfterContext
    >,
  ) => MiddlewareAfterServer<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TClientAfterContext | TNewClientAfterContext
  >
}

export interface MiddlewareAfterServer<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> extends MiddlewareTypes<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    >,
    MiddlewareClientAfter<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    > {}

export interface MiddlewareServer<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  server: <TNewServerContext = undefined, TNewClientAfterContext = undefined>(
    server: MiddlewareServerFn<
      TMiddlewares,
      TValidator,
      TServerContext,
      TNewServerContext,
      TNewClientAfterContext
    >,
  ) => MiddlewareAfterServer<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext | TNewServerContext,
    TClientContext,
    TClientAfterContext | TNewClientAfterContext
  >
}

export interface MiddlewareAfterClient<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> extends MiddlewareTypes<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    >,
    MiddlewareServer<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    > {}

export interface MiddlewareClient<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  client: <TNewServerContext = undefined, TNewClientContext = undefined>(
    client: MiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TNewServerContext,
      TNewClientContext
    >,
  ) => MiddlewareAfterClient<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext | TNewServerContext,
    TClientContext | TNewClientContext,
    TClientAfterContext
  >
}

export interface MiddlewareAfterMiddleware<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> extends MiddlewareTypes<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    >,
    MiddlewareServer<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    >,
    MiddlewareClient<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    >,
    MiddlewareValidator<
      TId,
      TMiddlewares,
      TValidator,
      TServerContext,
      TClientContext,
      TClientAfterContext
    > {}

export interface Middleware<
  TId,
  TMiddlewares,
  TValidator extends AnyValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> extends MiddlewareAfterMiddleware<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TClientAfterContext
  > {
  middleware: <const TNewMiddlewares>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareAfterMiddleware<
    TId,
    TNewMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TClientAfterContext
  >
}

export function createMiddleware<
  const TId,
  const TMiddlewares,
  TValidator extends AnyValidator = undefined,
  TServerContext = undefined,
  TClientContext = undefined,
  TClientAfterContext = undefined,
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
): Middleware<
  TId,
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext
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
    validator: (validator: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { validator })) as any
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
    clientAfter: (clientAfter: any) => {
      return createMiddleware<
        TId,
        TMiddlewares,
        TValidator,
        TServerContext,
        TClientContext
      >(undefined, Object.assign(resolvedOptions, { clientAfter })) as any
    },
  } as unknown as Middleware<
    TId,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TClientAfterContext
  >
}
