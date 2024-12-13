import type { ConstrainValidator, Method } from './createServerFn'
import type {
  Assign,
  Constrain,
  DefaultTransformerStringify,
  Expand,
  ResolveValidatorInput,
  ResolveValidatorOutput,
} from '@tanstack/react-router'

export type MergeAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [
  infer TMiddleware extends AnyMiddleware,
  ...infer TRest,
]
  ? MergeAllMiddleware<TRest, TType, Assign<TAcc, TMiddleware['_types'][TType]>>
  : TAcc

export type MergeAllClientAfterContext<
  TMiddlewares,
  TClientContext = undefined,
  TClientAfterContext = undefined,
> = unknown extends TClientContext
  ? TClientContext
  : Assign<
      MergeAllMiddleware<TMiddlewares, 'allClientAfterContext'>,
      Assign<TClientContext, TClientAfterContext>
    >

/**
 * Recursively resolve the client context type produced by a sequence of middleware
 */
export type MergeAllClientContext<
  TMiddlewares,
  TContext = undefined,
> = unknown extends TContext
  ? TContext
  : Assign<MergeAllMiddleware<TMiddlewares, 'allClientContext'>, TContext>

/**
 * Recursively resolve the server context type produced by a sequence of middleware
 */
export type MergeAllServerContext<
  TMiddlewares,
  TContext = undefined,
> = unknown extends TContext
  ? TContext
  : Assign<MergeAllMiddleware<TMiddlewares, 'allServerContext'>, TContext>

/**
 * Recursively resolve the input type produced by a sequence of middleware
 */
export type MergeAllValidatorInputs<TMiddlewares, TValidator> =
  unknown extends TValidator
    ? TValidator
    : Assign<
        MergeAllMiddleware<TMiddlewares, 'allInput'>,
        TValidator extends undefined
          ? undefined
          : ResolveValidatorInput<TValidator>
      >
/**
 * Recursively merge the output type produced by a sequence of middleware
 */
export type MergeAllValidatorOutputs<TMiddlewares, TValidator> =
  unknown extends TValidator
    ? TValidator
    : Assign<
        MergeAllMiddleware<TMiddlewares, 'allOutput'>,
        TValidator extends undefined
          ? undefined
          : ResolveValidatorOutput<TValidator>
      >

export interface MiddlewareOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
  in out TClientContext,
> {
  validateClient?: boolean
  middleware?: TMiddlewares
  validator?: ConstrainValidator<TValidator>
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

export type MiddlewareServerNextFn = <
  TNewServerContext = undefined,
  TNewClientAfterContext = undefined,
>(ctx?: {
  context?: TNewServerContext
  sendContext?: DefaultTransformerStringify<TNewClientAfterContext>
}) => Promise<
  ServerResultWithContext<TNewServerContext, TNewClientAfterContext>
>

export interface MiddlewareServerFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
> {
  data: Expand<MergeAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<MergeAllServerContext<TMiddlewares, TServerContext>>
  next: MiddlewareServerNextFn
}

export type MiddlewareServerFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TNewServerContext,
  TNewClientAfterContext,
> = (
  options: MiddlewareServerFnOptions<TMiddlewares, TValidator, TServerContext>,
) =>
  | Promise<ServerResultWithContext<TNewServerContext, TNewClientAfterContext>>
  | ServerResultWithContext<TNewServerContext, TNewClientAfterContext>

export type MiddlewareClientNextFn = <
  TNewServerContext = undefined,
  TNewClientContext = undefined,
>(ctx?: {
  context?: TNewClientContext
  sendContext?: DefaultTransformerStringify<TNewServerContext>
  headers?: HeadersInit
}) => Promise<ClientResultWithContext<TNewServerContext, TNewClientContext>>

export interface MiddlewareClientFnOptions<
  in out TMiddlewares,
  in out TValidator,
> {
  data: Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<MergeAllClientContext<TMiddlewares>>
  sendContext?: unknown // cc Chris Horobin
  method: Method
  next: MiddlewareClientNextFn
}

export type MiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TServerContext,
  TClientContext,
> = (
  options: MiddlewareClientFnOptions<TMiddlewares, TValidator>,
) =>
  | Promise<ClientResultWithContext<TServerContext, TClientContext>>
  | ClientResultWithContext<TServerContext, TClientContext>

export type MiddlewareClientAfterNextFn = <
  TNewClientAfterContext = undefined,
>(ctx?: {
  context?: TNewClientAfterContext
  sendContext?: never
  headers?: HeadersInit
}) => Promise<ClientAfterResultWithContext<TNewClientAfterContext>>

export interface MiddlewareClientAfterFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TClientContext,
  in out TClientAfterContext,
> {
  data: Expand<MergeAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<
    MergeAllClientAfterContext<
      TMiddlewares,
      TClientContext,
      TClientAfterContext
    >
  >
  method: Method
  next: MiddlewareClientAfterNextFn
}

export type MiddlewareClientAfterFn<
  TMiddlewares,
  TValidator,
  TClientContext,
  TClientAfterContext,
  TNewClientAfterContext,
> = (
  options: MiddlewareClientAfterFnOptions<
    TMiddlewares,
    TValidator,
    TClientContext,
    TClientAfterContext
  >,
) =>
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
  TValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  _types: {
    id: TId
    middlewares: TMiddlewares
    input: ResolveValidatorInput<TValidator>
    allInput: MergeAllValidatorInputs<TMiddlewares, TValidator>
    output: ResolveValidatorOutput<TValidator>
    allOutput: MergeAllValidatorOutputs<TMiddlewares, TValidator>
    clientContext: TClientContext
    allClientContext: MergeAllClientContext<TMiddlewares, TClientContext>
    serverContext: TServerContext
    allServerContext: MergeAllServerContext<TMiddlewares, TServerContext>
    clientAfterContext: TClientAfterContext
    allClientAfterContext: MergeAllClientAfterContext<
      TMiddlewares,
      TClientContext,
      TClientAfterContext
    >
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
  TValidator,
  TServerContext,
  TClientContext,
  TClientAfterContext,
> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TNewValidator>,
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
  TValidator,
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
    Assign<TClientAfterContext, TNewClientAfterContext>
  >
}

export interface MiddlewareAfterServer<
  TId,
  TMiddlewares,
  TValidator,
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
  TValidator,
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
    Assign<TServerContext, TNewServerContext>,
    TClientContext,
    Assign<TClientAfterContext, TNewClientAfterContext>
  >
}

export interface MiddlewareAfterClient<
  TId,
  TMiddlewares,
  TValidator,
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
  TValidator,
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
    Assign<TServerContext, TNewServerContext>,
    Assign<TClientContext, TNewClientContext>,
    TClientAfterContext
  >
}

export interface MiddlewareAfterMiddleware<
  TId,
  TMiddlewares,
  TValidator,
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
  TValidator,
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
  middleware: <const TNewMiddlewares = undefined>(
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
  TValidator = undefined,
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
