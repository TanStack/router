import type {
  ConstrainValidator,
  Method,
  ServerFnResponseType,
  ServerFnTypeOrTypeFn,
} from './createServerFn'
import type {
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  SerializerStringify,
} from '@tanstack/router-core'

export type AssignAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [
  infer TMiddleware extends AnyMiddleware,
  ...infer TRest,
]
  ? AssignAllMiddleware<
      TRest,
      TType,
      Assign<TAcc, TMiddleware['_types'][TType]>
    >
  : TAcc

/**
 * Recursively resolve the client context type produced by a sequence of middleware
 */
export type AssignAllClientContextBeforeNext<
  TMiddlewares,
  TClientContext = undefined,
> = unknown extends TClientContext
  ? TClientContext
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allClientContextBeforeNext'>,
      TClientContext
    >

export type AssignAllClientSendContext<
  TMiddlewares,
  TSendContext = undefined,
> = unknown extends TSendContext
  ? TSendContext
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allClientSendContext'>,
      TSendContext
    >

export type AssignAllClientContextAfterNext<
  TMiddlewares,
  TClientContext = undefined,
  TSendContext = undefined,
> = unknown extends TClientContext
  ? Assign<TClientContext, TSendContext>
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allClientContextAfterNext'>,
      Assign<TClientContext, TSendContext>
    >

/**
 * Recursively resolve the server context type produced by a sequence of middleware
 */
export type AssignAllServerContext<
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = unknown extends TSendContext
  ? Assign<TSendContext, TServerContext>
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allServerContext'>,
      Assign<TSendContext, TServerContext>
    >

export type AssignAllServerSendContext<
  TMiddlewares,
  TSendContext = undefined,
> = unknown extends TSendContext
  ? TSendContext
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allServerSendContext'>,
      TSendContext
    >

export type IntersectAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [
  infer TMiddleware extends AnyMiddleware,
  ...infer TRest,
]
  ? IntersectAllMiddleware<
      TRest,
      TType,
      IntersectAssign<TAcc, TMiddleware['_types'][TType]>
    >
  : TAcc

/**
 * Recursively resolve the input type produced by a sequence of middleware
 */
export type IntersectAllValidatorInputs<TMiddlewares, TValidator> =
  unknown extends TValidator
    ? TValidator
    : TValidator extends undefined
      ? IntersectAllMiddleware<TMiddlewares, 'allInput'>
      : IntersectAssign<
          IntersectAllMiddleware<TMiddlewares, 'allInput'>,
          ResolveValidatorInput<TValidator>
        >
/**
 * Recursively merge the output type produced by a sequence of middleware
 */
export type IntersectAllValidatorOutputs<TMiddlewares, TValidator> =
  unknown extends TValidator
    ? TValidator
    : TValidator extends undefined
      ? IntersectAllMiddleware<TMiddlewares, 'allOutput'>
      : IntersectAssign<
          IntersectAllMiddleware<TMiddlewares, 'allOutput'>,
          ResolveValidatorOutput<TValidator>
        >

export interface MiddlewareOptions<
  in out TType,
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
  in out TClientContext,
  in out TServerFnResponseType extends ServerFnResponseType,
> {
  validateClient?: boolean
  middleware?: TMiddlewares
  validator?: ConstrainValidator<TValidator>
  client?: MiddlewareClientFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TServerFnResponseType
  >
  server?: MiddlewareServerFn<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown,
    TServerFnResponseType
  >
}

export type MiddlewareServerNextFn<TMiddlewares, TServerSendContext> = <
  TNewServerContext = undefined,
  TSendContext = undefined,
>(ctx?: {
  context?: TNewServerContext
  sendContext?: SerializerStringify<TSendContext>
}) => Promise<
  ServerResultWithContext<
    TMiddlewares,
    TServerSendContext,
    TNewServerContext,
    TSendContext
  >
>

export interface MiddlewareServerFnFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
  in out TServerFnResponseType,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: MiddlewareServerNextFn<TMiddlewares, TServerSendContext>
  response: TServerFnResponseType
  method: Method
  filename: string
  functionId: string
  signal: AbortSignal
}

export interface MiddlewareServerFnRequestOptions<
  in out TMiddlewares,
  in out TServerSendContext,
> {
  request: Request
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: MiddlewareServerNextFn<TMiddlewares, TServerSendContext>
  response: Response
  method: Method
  signal: AbortSignal
}

export type MiddlewareServerFn<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: TType extends 'request'
    ? MiddlewareServerFnRequestOptions<TMiddlewares, TServerSendContext>
    : MiddlewareServerFnFnOptions<
        TMiddlewares,
        TValidator,
        TServerSendContext,
        TServerFnResponseType
      >,
) => MiddlewareServerFnResult<
  TMiddlewares,
  TServerSendContext,
  TNewServerContext,
  TSendContext
>

export type MiddlewareServerFnResult<
  TMiddlewares,
  TServerSendContext,
  TServerContext,
  TSendContext,
> =
  | Promise<
      ServerResultWithContext<
        TMiddlewares,
        TServerSendContext,
        TServerContext,
        TSendContext
      >
    >
  | ServerResultWithContext<
      TMiddlewares,
      TServerSendContext,
      TServerContext,
      TSendContext
    >

export type MiddlewareClientNextFn<TMiddlewares> = <
  TSendContext = undefined,
  TNewClientContext = undefined,
>(ctx?: {
  context?: TNewClientContext
  sendContext?: SerializerStringify<TSendContext>
  headers?: HeadersInit
}) => Promise<
  ClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface MiddlewareClientFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerFnResponseType extends ServerFnResponseType,
> {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllClientContextBeforeNext<TMiddlewares>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares>>
  method: Method
  response: TServerFnResponseType
  signal: AbortSignal
  next: MiddlewareClientNextFn<TMiddlewares>
  filename: string
  functionId: string
  type: ServerFnTypeOrTypeFn<
    Method,
    TServerFnResponseType,
    TMiddlewares,
    TValidator
  >
}

export type MiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: MiddlewareClientFnOptions<
    TMiddlewares,
    TValidator,
    TServerFnResponseType
  >,
) => MiddlewareClientFnResult<TMiddlewares, TSendContext, TClientContext>

export type MiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext,
> =
  | Promise<ClientResultWithContext<TMiddlewares, TSendContext, TClientContext>>
  | ClientResultWithContext<TMiddlewares, TSendContext, TClientContext>

export type ServerResultWithContext<
  in out TMiddlewares,
  in out TServerSendContext,
  in out TServerContext,
  in out TSendContext,
> = {
  'use functions must return the result of next()': true
  _types: {
    context: TServerContext
    sendContext: TSendContext
  }
  context: Expand<
    AssignAllServerContext<TMiddlewares, TServerSendContext, TServerContext>
  >
  sendContext: Expand<AssignAllClientSendContext<TMiddlewares, TSendContext>>
}

export type ClientResultWithContext<
  in out TMiddlewares,
  in out TSendContext,
  in out TClientContext,
> = {
  'use functions must return the result of next()': true
  context: Expand<AssignAllClientContextAfterNext<TMiddlewares, TClientContext>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares, TSendContext>>
  headers: HeadersInit
}

export type AnyMiddleware = MiddlewareWithTypes<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

export interface MiddlewareTypes<
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
  in out TServerSendContext,
  in out TClientContext,
  in out TClientSendContext,
> {
  middlewares: TMiddlewares
  input: ResolveValidatorInput<TValidator>
  allInput: IntersectAllValidatorInputs<TMiddlewares, TValidator>
  output: ResolveValidatorOutput<TValidator>
  allOutput: IntersectAllValidatorOutputs<TMiddlewares, TValidator>
  clientContext: TClientContext
  allClientContextBeforeNext: AssignAllClientContextBeforeNext<
    TMiddlewares,
    TClientContext
  >
  allClientContextAfterNext: AssignAllClientContextAfterNext<
    TMiddlewares,
    TClientContext,
    TClientSendContext
  >
  serverContext: TServerContext
  serverSendContext: TServerSendContext
  allServerSendContext: AssignAllServerSendContext<
    TMiddlewares,
    TServerSendContext
  >
  allServerContext: AssignAllServerContext<
    TMiddlewares,
    TServerSendContext,
    TServerContext
  >
  clientSendContext: TClientSendContext
  allClientSendContext: AssignAllClientSendContext<
    TMiddlewares,
    TClientSendContext
  >
  validator: TValidator
}

export interface MiddlewareWithTypes<
  TType,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> {
  _types: MiddlewareTypes<
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  >
  options: MiddlewareOptions<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TServerFnResponseType
  >
}

export interface MiddlewareAfterValidator<
  TType,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> extends MiddlewareWithTypes<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined,
      ServerFnResponseType
    >,
    MiddlewareServer<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    MiddlewareClient<TType, TMiddlewares, TValidator, ServerFnResponseType> {}

export interface MiddlewareValidator<
  TType,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TNewValidator>,
  ) => MiddlewareAfterValidator<
    TType,
    TMiddlewares,
    TNewValidator,
    TServerFnResponseType
  >
}

export interface MiddlewareAfterServer<
  TType,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends MiddlewareWithTypes<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext,
    TServerFnResponseType
  > {}

export interface MiddlewareServer<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: MiddlewareServerFn<
      TType,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext,
      TServerFnResponseType
    >,
  ) => MiddlewareAfterServer<
    TType,
    TMiddlewares,
    TValidator,
    TNewServerContext,
    TServerSendContext,
    TClientContext,
    TSendContext,
    ServerFnResponseType
  >
}

export interface MiddlewareAfterClient<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends MiddlewareWithTypes<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined,
      TServerFnResponseType
    >,
    MiddlewareServer<
      TType,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext,
      TServerFnResponseType
    > {}

export interface MiddlewareClient<
  TType,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: MiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext,
      TServerFnResponseType
    >,
  ) => MiddlewareAfterClient<
    TType,
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext,
    ServerFnResponseType
  >
}

export interface MiddlewareAfterMiddleware<
  TType,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> extends MiddlewareWithTypes<
      TType,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    MiddlewareServer<
      TType,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    MiddlewareClient<TType, TMiddlewares, undefined, TServerFnResponseType>,
    MiddlewareValidator<TType, TMiddlewares, TServerFnResponseType> {}

export interface Middleware<
  TType,
  TServerFnResponseType extends ServerFnResponseType,
> extends MiddlewareAfterMiddleware<TType, unknown, TServerFnResponseType> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareAfterMiddleware<TType, TNewMiddlewares, TServerFnResponseType>
}

export type MiddlewareType = 'request' | 'function'

export function createMiddleware<TType extends MiddlewareType>(
  options: {
    type: TType
    validateClient?: boolean
  },
  __opts?: MiddlewareOptions<
    TType,
    unknown,
    undefined,
    undefined,
    undefined,
    ServerFnResponseType
  >,
): Middleware<TType, ServerFnResponseType> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions = {
    type: 'function',
    ...(__opts ||
      (options as MiddlewareOptions<
        TType,
        unknown,
        undefined,
        undefined,
        undefined,
        ServerFnResponseType
      >)),
  }

  return {
    options: resolvedOptions,
    middleware: (middleware: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    validator: (validator: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { validator }),
      ) as any
    },
    client: (client: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { client }),
      ) as any
    },
    server: (server: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { server }),
      ) as any
    },
  } as unknown as Middleware<TType, ServerFnResponseType>
}
