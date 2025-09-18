import type { AnyServerFn, ConstrainValidator, Method } from './createServerFn'
import type {
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  Register,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  ValidateSerializableInput,
} from '@tanstack/router-core'

export function createMiddleware<
  TRegister extends Register,
  TType extends MiddlewareType,
>(
  options?: {
    type?: TType
  },
  __opts?: FunctionMiddlewareOptions<
    TRegister,
    unknown,
    undefined,
    undefined,
    undefined
  >,
): CreateMiddlewareResult<TRegister, TType> {
  const resolvedOptions = {
    type: 'request',
    ...(__opts ||
      (options as FunctionMiddlewareOptions<
        TRegister,
        unknown,
        undefined,
        undefined,
        undefined
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
  } as unknown as CreateMiddlewareResult<TRegister, TType>
}

export type MiddlewareType = 'request' | 'function'

export type CreateMiddlewareResult<
  TRegister extends Register,
  TType extends MiddlewareType,
> = 'request' extends TType ? RequestMiddleware : FunctionMiddleware<TRegister>

export interface FunctionMiddleware<TRegister extends Register>
  extends FunctionMiddlewareAfterMiddleware<TRegister, unknown> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyFunctionMiddleware>
    >,
  ) => FunctionMiddlewareAfterMiddleware<TRegister, TNewMiddlewares>
}

export interface FunctionMiddlewareAfterMiddleware<
  TRegister extends Register,
  TMiddlewares,
> extends FunctionMiddlewareWithTypes<
      TRegister,
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareServer<
      TRegister,
      TMiddlewares,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareClient<TRegister, TMiddlewares, undefined>,
    FunctionMiddlewareValidator<TRegister, TMiddlewares> {}

export interface FunctionMiddlewareWithTypes<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
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
    TRegister,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
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
    | keyof AnyRequestMiddleware['_types']
    | keyof AnyServerFn['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends
      | AnyFunctionMiddleware
      | AnyRequestMiddleware
      | AnyServerFn
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
    | keyof AnyRequestMiddleware['_types']
    | keyof AnyServerFn['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends
      | AnyFunctionMiddleware
      | AnyRequestMiddleware
      | AnyServerFn
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
  in out TRegister extends Register,
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
  in out TClientContext,
> {
  middleware?: TMiddlewares
  validator?: ConstrainValidator<TRegister, 'GET', TValidator>
  client?: FunctionMiddlewareClientFn<
    TRegister,
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
  server?: FunctionMiddlewareServerFn<
    TRegister,
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown
  >
}

export type FunctionMiddlewareClientNextFn<
  TRegister extends Register,
  TMiddlewares,
> = <TSendContext = undefined, TNewClientContext = undefined>(ctx?: {
  context?: TNewClientContext
  sendContext?: ValidateSerializableInput<TRegister, TSendContext>
  headers?: HeadersInit
}) => Promise<
  FunctionClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface FunctionMiddlewareServer<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: FunctionMiddlewareServerFn<
      TRegister,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext
    >,
  ) => FunctionMiddlewareAfterServer<
    TRegister,
    TMiddlewares,
    TValidator,
    TNewServerContext,
    TServerSendContext,
    TClientContext,
    TSendContext
  >
}

export type FunctionMiddlewareServerFn<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
> = (
  options: FunctionMiddlewareServerFnOptions<
    TRegister,
    TMiddlewares,
    TValidator,
    TServerSendContext
  >,
) => FunctionMiddlewareServerFnResult<
  TMiddlewares,
  TServerSendContext,
  TNewServerContext,
  TSendContext
>

export interface RequestMiddlewareServerFnOptions<
  in out TRegister extends Register,
  in out TMiddlewares,
  in out TServerSendContext,
> {
  request: Request
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<
    TRegister,
    TMiddlewares,
    TServerSendContext
  >
  response: Response
  method: Method
  signal: AbortSignal
}

export type FunctionMiddlewareServerNextFn<
  TRegister extends Register,
  TMiddlewares,
  TServerSendContext,
> = <TNewServerContext = undefined, TSendContext = undefined>(ctx?: {
  context?: TNewServerContext
  sendContext?: ValidateSerializableInput<TRegister, TSendContext>
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
  in out TRegister extends Register,
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<
    TRegister,
    TMiddlewares,
    TServerSendContext
  >
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
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
> extends FunctionMiddlewareWithTypes<
    TRegister,
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  > {}

export interface FunctionMiddlewareClient<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: FunctionMiddlewareClientFn<
      TRegister,
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext
    >,
  ) => FunctionMiddlewareAfterClient<
    TRegister,
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext
  >
}

export type FunctionMiddlewareClientFn<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
> = (
  options: FunctionMiddlewareClientFnOptions<
    TRegister,
    TMiddlewares,
    TValidator
  >,
) => FunctionMiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext
>

export interface FunctionMiddlewareClientFnOptions<
  in out TRegister extends Register,
  in out TMiddlewares,
  in out TValidator,
> {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllClientContextBeforeNext<TMiddlewares>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares>>
  method: Method
  signal: AbortSignal
  next: FunctionMiddlewareClientNextFn<TRegister, TMiddlewares>
  filename: string
  functionId: string
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
  TRegister extends Register,
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> extends FunctionMiddlewareWithTypes<
      TRegister,
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined
    >,
    FunctionMiddlewareServer<
      TRegister,
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext
    > {}

export interface FunctionMiddlewareValidator<
  TRegister extends Register,
  TMiddlewares,
> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TRegister, 'GET', TNewValidator>,
  ) => FunctionMiddlewareAfterValidator<TRegister, TMiddlewares, TNewValidator>
}

export interface FunctionMiddlewareAfterValidator<
  TRegister extends Register,
  TMiddlewares,
  TValidator,
> extends FunctionMiddlewareWithTypes<
      TRegister,
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareServer<
      TRegister,
      TMiddlewares,
      TValidator,
      undefined,
      undefined
    >,
    FunctionMiddlewareClient<TRegister, TMiddlewares, TValidator> {}

export interface RequestMiddleware
  extends RequestMiddlewareAfterMiddleware<undefined> {
  middleware: <const TMiddlewares = undefined>(
    middlewares: Constrain<TMiddlewares, ReadonlyArray<AnyRequestMiddleware>>,
  ) => RequestMiddlewareAfterMiddleware<TMiddlewares>
}

export type AnyRequestMiddleware = RequestMiddlewareWithTypes<any, any>

export interface RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {
  _types: RequestMiddlewareTypes<TMiddlewares, TServerContext>
  options: RequestMiddlewareOptions<TMiddlewares, TServerContext>
}

export interface RequestMiddlewareOptions<
  in out TMiddlewares,
  in out TServerContext,
> {
  middleware?: TMiddlewares
  server?: RequestServerFn<TMiddlewares, TServerContext>
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
