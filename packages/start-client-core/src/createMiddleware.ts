import type {
  ConstrainValidator,
  Method,
  ServerFnResponseType,
  ServerFnTypeOrTypeFn,
} from './createServerFn'
import type {
  Assign,
  Constrain,
  DefaultStartRegister,
  Expand,
  InferSerializer,
  IntersectAssign,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  StartRegister,
  TypeSerializerStringify,
} from '@tanstack/router-core'

export function createMiddleware<
  TType extends MiddlewareType,
  TStart extends DefaultStartRegister = StartRegister,
>(
  options: {
    type: TType
    validateClient?: boolean
  },
  __opts?: FunctionMiddlewareOptions<
    TStart,
    unknown,
    undefined,
    undefined,
    undefined,
    ServerFnResponseType
  >,
): CreateMiddlewareResult<TStart, TType> {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions = {
    type: 'function',
    ...(__opts ||
      (options as FunctionMiddlewareOptions<
        TStart,
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
  } as unknown as CreateMiddlewareResult<TStart, TType>
}

export type MiddlewareType = 'request' | 'function'

export type CreateMiddlewareResult<
  TStart extends DefaultStartRegister,
  TType extends MiddlewareType,
> = 'function' extends TType
  ? FunctionMiddleware<TStart, ServerFnResponseType>
  : RequestMiddleware

export interface FunctionMiddleware<
  TStart extends DefaultStartRegister,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareAfterMiddleware<
    TStart,
    unknown,
    TServerFnResponseType
  > {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyFunctionMiddleware>
    >,
  ) => FunctionMiddlewareAfterMiddleware<
    TStart,
    TNewMiddlewares,
    TServerFnResponseType
  >
}

export interface FunctionMiddlewareAfterMiddleware<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TStart,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TStart,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareClient<
      TStart,
      TMiddlewares,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareValidator<TStart, TMiddlewares, TServerFnResponseType> {}

export interface FunctionMiddlewareWithTypes<
  TStart extends DefaultStartRegister,
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
    TStart,
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
  type: 'function'
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
  TType extends
    | keyof AnyFunctionMiddleware['_types']
    | keyof AnyRequestMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends AnyFunctionMiddleware | AnyRequestMiddleware
    ? IntersectAllMiddleware<
        TRest,
        TType,
        IntersectAssign<
          TAcc,
          TMiddleware['_types'][TType & keyof TMiddleware['_types']]
        >
      >
    : TAcc
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
  TType extends
    | keyof AnyFunctionMiddleware['_types']
    | keyof AnyRequestMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends AnyFunctionMiddleware | AnyRequestMiddleware
    ? AssignAllMiddleware<
        TRest,
        TType,
        Assign<TAcc, TMiddleware['_types'][TType & keyof TMiddleware['_types']]>
      >
    : TAcc
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
  in out TStart extends DefaultStartRegister,
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
    TStart,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext,
    TServerFnResponseType
  >
  server?: FunctionMiddlewareServerFn<
    TStart,
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown,
    TServerFnResponseType
  >
}

export type FunctionMiddlewareClientNextFn<
  TStart extends DefaultStartRegister,
  TMiddlewares,
> = <TSendContext = undefined, TNewClientContext = undefined>(ctx?: {
  context?: TNewClientContext
  sendContext?: TypeSerializerStringify<InferSerializer<TStart>, TSendContext>
  headers?: HeadersInit
}) => Promise<
  FunctionClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface FunctionMiddlewareServer<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: FunctionMiddlewareServerFn<
      TStart,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext,
      TServerFnResponseType
    >,
  ) => FunctionMiddlewareAfterServer<
    TStart,
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
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: FunctionMiddlewareServerFnOptions<
    TStart,
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
  in out TStart extends DefaultStartRegister,
  in out TMiddlewares,
  in out TServerSendContext,
> {
  request: Request
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<TStart, TMiddlewares, TServerSendContext>
  response: Response
  method: Method
  signal: AbortSignal
}

export type FunctionMiddlewareServerNextFn<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TServerSendContext,
> = <TNewServerContext = undefined, TSendContext = undefined>(ctx?: {
  context?: TNewServerContext
  sendContext?: TypeSerializerStringify<InferSerializer<TStart>, TSendContext>
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
  in out TStart extends DefaultStartRegister,
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
  in out TServerFnResponseType,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<TStart, TMiddlewares, TServerSendContext>
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
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
    TStart,
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext,
    TServerFnResponseType
  > {}

export interface FunctionMiddlewareClient<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: FunctionMiddlewareClientFn<
      TStart,
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext,
      TServerFnResponseType
    >,
  ) => FunctionMiddlewareAfterClient<
    TStart,
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext,
    ServerFnResponseType
  >
}

export type FunctionMiddlewareClientFn<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> = (
  options: FunctionMiddlewareClientFnOptions<
    TStart,
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
  in out TStart extends DefaultStartRegister,
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
  next: FunctionMiddlewareClientNextFn<TStart, TMiddlewares>
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
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TStart,
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TStart,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext,
      TServerFnResponseType
    > {}

export interface FunctionMiddlewareValidator<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TServerFnResponseType extends ServerFnResponseType,
> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TNewValidator>,
  ) => FunctionMiddlewareAfterValidator<
    TStart,
    TMiddlewares,
    TNewValidator,
    TServerFnResponseType
  >
}

export interface FunctionMiddlewareAfterValidator<
  TStart extends DefaultStartRegister,
  TMiddlewares,
  TValidator,
  TServerFnResponseType extends ServerFnResponseType,
> extends FunctionMiddlewareWithTypes<
      TStart,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined,
      ServerFnResponseType
    >,
    FunctionMiddlewareServer<
      TStart,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      TServerFnResponseType
    >,
    FunctionMiddlewareClient<
      TStart,
      TMiddlewares,
      TValidator,
      ServerFnResponseType
    > {}

export interface RequestMiddleware
  extends RequestMiddlewareAfterMiddleware<undefined> {
  middleware: <const TMiddlewares = undefined>(
    middlewares: Constrain<TMiddlewares, ReadonlyArray<AnyRequestMiddleware>>,
  ) => RequestMiddlewareAfterMiddleware<TMiddlewares>
}

export type AnyRequestMiddleware = RequestMiddlewareWithTypes<any, any>

export interface RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {
  _types: RequestMiddlewareTypes<TMiddlewares, TServerContext>
}

export interface RequestMiddlewareTypes<TMiddlewares, TServerContext> {
  type: 'request'
  middlewares: TMiddlewares
  serverContext: TServerContext
  allServerContext: AssignAllServerContext<
    TMiddlewares,
    undefined,
    TServerContext
  >
}

export interface RequestMiddlewareAfterMiddleware<TMiddlewares>
  extends RequestMiddlewareWithTypes<TMiddlewares, undefined>,
    RequestMiddlewareServer<TMiddlewares> {}

export interface RequestMiddlewareServer<TMiddlewares> {
  server: <TServerContext = undefined>(
    fn: RequestServerFn<TMiddlewares, TServerContext>,
  ) => RequestMiddlewareAfterServer<TMiddlewares, TServerContext>
}

export type RequestServerFn<TMiddlewares, TServerContext> = (
  options: RequestServerOptions<TMiddlewares>,
) => RequestMiddlewareServerFnResult<TMiddlewares, TServerContext>

export interface RequestServerOptions<TMiddlewares> {
  request: Request
  pathname: string
  context: AssignAllServerContext<TMiddlewares>
  next: RequestServerNextFn<TMiddlewares>
}

export type RequestServerNextFn<TMiddlewares> = <TServerContext = undefined>(
  options?: RequestServerNextFnOptions<TServerContext>,
) => RequestMiddlewareServerFnResult<TMiddlewares, TServerContext>

export interface RequestServerNextFnOptions<TServerContext> {
  context?: TServerContext
}

export type RequestMiddlewareServerFnResult<TMiddlewares, TServerContext> =
  | Promise<RequestServerResult<TMiddlewares, TServerContext>>
  | RequestServerResult<TMiddlewares, TServerContext>

export interface RequestServerResult<TMiddlewares, TServerContext> {
  request: Request
  pathname: string
  context: Expand<
    AssignAllServerContext<TMiddlewares, undefined, TServerContext>
  >
  response: Response
}

export interface RequestMiddlewareAfterServer<TMiddlewares, TServerContext>
  extends RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {}
