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

export function createMiddleware<TType extends MiddlewareType>(
  options: {
    type: TType
    validateClient?: boolean
  },
  __opts?: FunctionMiddlewareOptions<
    TType,
    unknown,
    undefined,
    undefined,
    undefined,
    ServerFnResponseType
  >,
): FunctionMiddleware<TType, ServerFnResponseType> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions = {
    type: 'function',
    ...(__opts ||
      (options as FunctionMiddlewareOptions<
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
  } as unknown as FunctionMiddleware<TType, ServerFnResponseType>
}

export type MiddlewareType = 'request' | 'function'

export interface FunctionMiddleware<
  TType,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareAfterMiddleware<
    TType,
    unknown,
    TServerFnResponseType
  > {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyFunctionMiddleware>
    >,
  ) => FunctionMiddlewareAfterMiddleware<
    TType,
    TNewMiddlewares,
    TServerFnResponseType
  >
}

export interface FunctionMiddlewareAfterMiddleware<
  TType,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TType,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TType,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareClient<
      TType,
      TMiddlewares,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareValidator<TType, TMiddlewares, TServerFnResponseType> {}

export interface FunctionMiddlewareWithTypes<
  TType,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> {
  _types: FunctionMiddlewareTypes<
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  >
  options: FunctionMiddlewareOptions<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TServerFnResponseType
  >
}

export interface FunctionMiddlewareTypes<
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

export type IntersectAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyFunctionMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [
  infer TMiddleware extends AnyFunctionMiddleware,
  ...infer TRest,
]
  ? IntersectAllMiddleware<
      TRest,
      TType,
      IntersectAssign<TAcc, TMiddleware['_types'][TType]>
    >
  : TAcc

export type AnyFunctionMiddleware = FunctionMiddlewareWithTypes<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
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

export type AssignAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyFunctionMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [
  infer TMiddleware extends AnyFunctionMiddleware,
  ...infer TRest,
]
  ? AssignAllMiddleware<
      TRest,
      TType,
      Assign<TAcc, TMiddleware['_types'][TType]>
    >
  : TAcc

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

export type AssignAllServerSendContext<
  TMiddlewares,
  TSendContext = undefined,
> = unknown extends TSendContext
  ? TSendContext
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allServerSendContext'>,
      TSendContext
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

export type AssignAllClientSendContext<
  TMiddlewares,
  TSendContext = undefined,
> = unknown extends TSendContext
  ? TSendContext
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allClientSendContext'>,
      TSendContext
    >

export interface FunctionMiddlewareOptions<
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
  client?: FunctionMiddlewareClientFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TServerFnResponseType
  >
  server?: FunctionMiddlewareServerFn<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown,
    TServerFnResponseType
  >
}

export type FunctionMiddlewareClientNextFn<TMiddlewares> = <
  TSendContext = undefined,
  TNewClientContext = undefined,
>(ctx?: {
  context?: TNewClientContext
  sendContext?: SerializerStringify<TSendContext>
  headers?: HeadersInit
}) => Promise<
  FunctionClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface FunctionMiddlewareServer<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: FunctionMiddlewareServerFn<
      TType,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext,
      TServerFnResponseType
    >,
  ) => FunctionMiddlewareAfterServer<
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
export type FunctionMiddlewareServerFn<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: TType extends 'request'
    ? RequestMiddlewareServerFnOptions<TMiddlewares, TServerSendContext>
    : FunctionMiddlewareServerFnOptions<
        TMiddlewares,
        TValidator,
        TServerSendContext,
        TServerFnResponseType
      >,
) => FunctionMiddlewareServerFnResult<
  TMiddlewares,
  TServerSendContext,
  TNewServerContext,
  TSendContext
>

export interface RequestMiddlewareServerFnOptions<
  in out TMiddlewares,
  in out TServerSendContext,
> {
  request: Request
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<TMiddlewares, TServerSendContext>
  response: Response
  method: Method
  signal: AbortSignal
}

export type FunctionMiddlewareServerNextFn<TMiddlewares, TServerSendContext> = <
  TNewServerContext = undefined,
  TSendContext = undefined,
>(ctx?: {
  context?: TNewServerContext
  sendContext?: SerializerStringify<TSendContext>
}) => Promise<
  FunctionServerResultWithContext<
    TMiddlewares,
    TServerSendContext,
    TNewServerContext,
    TSendContext
  >
>

export type FunctionServerResultWithContext<
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

export interface FunctionMiddlewareServerFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
  in out TServerFnResponseType,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<TMiddlewares, TServerSendContext>
  response: TServerFnResponseType
  method: Method
  filename: string
  functionId: string
  signal: AbortSignal
}

export type FunctionMiddlewareServerFnResult<
  TMiddlewares,
  TServerSendContext,
  TServerContext,
  TSendContext,
> =
  | Promise<
      FunctionServerResultWithContext<
        TMiddlewares,
        TServerSendContext,
        TServerContext,
        TSendContext
      >
    >
  | FunctionServerResultWithContext<
      TMiddlewares,
      TServerSendContext,
      TServerContext,
      TSendContext
    >

export interface FunctionMiddlewareAfterServer<
  TType,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
    TType,
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext,
    TServerFnResponseType
  > {}

export interface FunctionMiddlewareClient<
  TType,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: FunctionMiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext,
      TServerFnResponseType
    >,
  ) => FunctionMiddlewareAfterClient<
    TType,
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext,
    ServerFnResponseType
  >
}

export type FunctionMiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: FunctionMiddlewareClientFnOptions<
    TMiddlewares,
    TValidator,
    TServerFnResponseType
  >,
) => FunctionMiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext
>

export interface FunctionMiddlewareClientFnOptions<
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
  next: FunctionMiddlewareClientNextFn<TMiddlewares>
  filename: string
  functionId: string
  type: ServerFnTypeOrTypeFn<
    Method,
    TServerFnResponseType,
    TMiddlewares,
    TValidator
  >
}

export type FunctionMiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext,
> =
  | Promise<
      FunctionClientResultWithContext<
        TMiddlewares,
        TSendContext,
        TClientContext
      >
    >
  | FunctionClientResultWithContext<TMiddlewares, TSendContext, TClientContext>

export type FunctionClientResultWithContext<
  in out TMiddlewares,
  in out TSendContext,
  in out TClientContext,
> = {
  'use functions must return the result of next()': true
  context: Expand<AssignAllClientContextAfterNext<TMiddlewares, TClientContext>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares, TSendContext>>
  headers: HeadersInit
}

export interface FunctionMiddlewareAfterClient<
  TType,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TType,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext,
      TServerFnResponseType
    > {}

export interface FunctionMiddlewareValidator<
  TType,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TNewValidator>,
  ) => FunctionMiddlewareAfterValidator<
    TType,
    TMiddlewares,
    TNewValidator,
    TServerFnResponseType
  >
}

export interface FunctionMiddlewareAfterValidator<
  TType,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined,
      ServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TType,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareClient<
      TType,
      TMiddlewares,
      TValidator,
      ServerFnResponseType
    > {}
