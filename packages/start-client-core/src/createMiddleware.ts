import type { StartInstanceOptions } from './createStart'
import type { AnyServerFn, ConstrainValidator, Method } from './createServerFn'
import type {
  AnyContext,
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  Register,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  ValidateSerializableInput,
} from '@tanstack/router-core'

export type CreateMiddlewareFn<TRegister> = <TType extends MiddlewareType>(
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
) => CreateMiddlewareResult<TRegister, TType>

export const createMiddleware: CreateMiddlewareFn<{}> = (options, __opts) => {
  const resolvedOptions = {
    type: 'request',
    ...(__opts || options),
  }

  return {
    options: resolvedOptions,
    middleware: (middleware: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    inputValidator: (inputValidator: any) => {
      return createMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { inputValidator }),
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
  } as any
}

export type MiddlewareType = 'request' | 'function'

export type CreateMiddlewareResult<
  TRegister,
  TType extends MiddlewareType,
> = 'request' extends TType
  ? RequestMiddleware<TRegister>
  : FunctionMiddleware<TRegister>

export interface FunctionMiddleware<TRegister>
  extends FunctionMiddlewareAfterMiddleware<TRegister, unknown> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyRequestMiddleware | AnyFunctionMiddleware>
    >,
  ) => FunctionMiddlewareAfterMiddleware<TRegister, TNewMiddlewares>
}

export interface FunctionMiddlewareAfterMiddleware<TRegister, TMiddlewares>
  extends FunctionMiddlewareWithTypes<
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
  TRegister,
  TMiddlewares,
  TInputValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
> {
  _types: FunctionMiddlewareTypes<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  >
  options: FunctionMiddlewareOptions<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerContext,
    TClientContext
  >
}

export interface FunctionMiddlewareTypes<
  in out TRegister,
  in out TMiddlewares,
  in out TInputValidator,
  in out TServerContext,
  in out TServerSendContext,
  in out TClientContext,
  in out TClientSendContext,
> {
  type: 'function'
  middlewares: TMiddlewares
  input: ResolveValidatorInput<TInputValidator>
  allInput: IntersectAllValidatorInputs<TMiddlewares, TInputValidator>
  output: ResolveValidatorOutput<TInputValidator>
  allOutput: IntersectAllValidatorOutputs<TMiddlewares, TInputValidator>
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
  allServerContext: AssignAllServerFnContext<
    TRegister,
    TMiddlewares,
    TServerSendContext,
    TServerContext
  >
  clientSendContext: TClientSendContext
  allClientSendContext: AssignAllClientSendContext<
    TMiddlewares,
    TClientSendContext
  >
  inputValidator: TInputValidator
}

/**
 * Recursively resolve the input type produced by a sequence of middleware
 */
export type IntersectAllValidatorInputs<TMiddlewares, TInputValidator> =
  unknown extends TInputValidator
    ? TInputValidator
    : TInputValidator extends undefined
      ? IntersectAllMiddleware<TMiddlewares, 'allInput'>
      : IntersectAssign<
          IntersectAllMiddleware<TMiddlewares, 'allInput'>,
          ResolveValidatorInput<TInputValidator>
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
export type IntersectAllValidatorOutputs<TMiddlewares, TInputValidator> =
  unknown extends TInputValidator
    ? TInputValidator
    : TInputValidator extends undefined
      ? IntersectAllMiddleware<TMiddlewares, 'allOutput'>
      : IntersectAssign<
          IntersectAllMiddleware<TMiddlewares, 'allOutput'>,
          ResolveValidatorOutput<TInputValidator>
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

export type AssignAllServerRequestContext<
  TRegister,
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = Assign<
  // Fetch Request Context
  GlobalFetchRequestContext,
  // AnyContext,
  Assign<
    GlobalServerRequestContext<TRegister>, // TODO: This enabled global middleware
    // type inference, but creates a circular types issue. No idea how to fix this.
    // AnyContext,
    __AssignAllServerRequestContext<TMiddlewares, TSendContext, TServerContext>
  >
>

// export type GlobalFetchRequestContext<TRegister> = AnyContext
export type GlobalFetchRequestContext = Register extends {
  server: { requestContext: infer TRequestContext }
}
  ? TRequestContext
  : AnyContext

export type GlobalServerRequestContext<TRegister> = TRegister extends {
  config: StartInstanceOptions<any, any, infer TRequestMiddlewares, any>
}
  ? AssignAllMiddleware<TRequestMiddlewares, 'allServerContext'>
  : AnyContext

type __AssignAllServerRequestContext<
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = unknown extends TSendContext
  ? Assign<TSendContext, TServerContext>
  : Assign<
      AssignAllMiddleware<TMiddlewares, 'allServerContext'>,
      Assign<TSendContext, TServerContext>
    >

export type AssignAllServerFnContext<
  TRegister,
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = Assign<
  GlobalFetchRequestContext,
  Assign<
    GlobalServerRequestContext<TRegister>, // TODO: This enabled global middleware
    // type inference, but creates a circular types issue. No idea how to fix this.
    // AnyContext,
    Assign<
      GlobalServerFnContext<TRegister>, // TODO: This enabled global middleware
      // type inference, but creates a circular types issue. No idea how to fix this.
      // AnyContext,/
      __AssignAllServerFnContext<TMiddlewares, TSendContext, TServerContext>
    >
  >
>

type GlobalServerFnContext<TRegister> = TRegister extends {
  config: StartInstanceOptions<any, any, any, infer TFunctionMiddlewares>
}
  ? AssignAllMiddleware<TFunctionMiddlewares, 'allServerContext'>
  : AnyContext

type __AssignAllServerFnContext<
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
  in out TRegister,
  in out TMiddlewares,
  in out TInputValidator,
  in out TServerContext,
  in out TClientContext,
> {
  middleware?: TMiddlewares
  inputValidator?: ConstrainValidator<TRegister, 'GET', TInputValidator>
  client?: FunctionMiddlewareClientFn<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerContext,
    TClientContext
  >
  server?: FunctionMiddlewareServerFn<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerContext,
    unknown,
    unknown
  >
}

export type FunctionMiddlewareClientNextFn<TRegister, TMiddlewares> = <
  TSendContext = undefined,
  TNewClientContext = undefined,
>(ctx?: {
  context?: TNewClientContext
  sendContext?: ValidateSerializableInput<TRegister, TSendContext>
  headers?: HeadersInit
}) => Promise<
  FunctionClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface FunctionMiddlewareServer<
  TRegister,
  TMiddlewares,
  TInputValidator,
  TServerSendContext,
  TClientContext,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: FunctionMiddlewareServerFn<
      TRegister,
      TMiddlewares,
      TInputValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext
    >,
  ) => FunctionMiddlewareAfterServer<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TNewServerContext,
    TServerSendContext,
    TClientContext,
    TSendContext
  >
}

export type FunctionMiddlewareServerFn<
  TRegister,
  TMiddlewares,
  TInputValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
> = (
  options: FunctionMiddlewareServerFnOptions<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerSendContext
  >,
) => FunctionMiddlewareServerFnResult<
  TRegister,
  TMiddlewares,
  TServerSendContext,
  TNewServerContext,
  TSendContext
>

export type FunctionMiddlewareServerNextFn<
  TRegister,
  TMiddlewares,
  TServerSendContext,
> = <TNewServerContext = undefined, TSendContext = undefined>(ctx?: {
  context?: TNewServerContext
  sendContext?: ValidateSerializableInput<TRegister, TSendContext>
}) => Promise<
  FunctionServerResultWithContext<
    TRegister,
    TMiddlewares,
    TServerSendContext,
    TNewServerContext,
    TSendContext
  >
>

export type FunctionServerResultWithContext<
  in out TRegister,
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
    AssignAllServerFnContext<
      TRegister,
      TMiddlewares,
      TServerSendContext,
      TServerContext
    >
  >
  sendContext: Expand<AssignAllClientSendContext<TMiddlewares, TSendContext>>
}

export interface FunctionMiddlewareServerFnOptions<
  in out TRegister,
  in out TMiddlewares,
  in out TInputValidator,
  in out TServerSendContext,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TInputValidator>>
  context: Expand<
    AssignAllServerFnContext<TRegister, TMiddlewares, TServerSendContext>
  >
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
  TRegister,
  TMiddlewares,
  TServerSendContext,
  TServerContext,
  TSendContext,
> =
  | Promise<
      FunctionServerResultWithContext<
        TRegister,
        TMiddlewares,
        TServerSendContext,
        TServerContext,
        TSendContext
      >
    >
  | FunctionServerResultWithContext<
      TRegister,
      TMiddlewares,
      TServerSendContext,
      TServerContext,
      TSendContext
    >

export interface FunctionMiddlewareAfterServer<
  TRegister,
  TMiddlewares,
  TInputValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
> extends FunctionMiddlewareWithTypes<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  > {}

export interface FunctionMiddlewareClient<
  TRegister,
  TMiddlewares,
  TInputValidator,
> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: FunctionMiddlewareClientFn<
      TRegister,
      TMiddlewares,
      TInputValidator,
      TSendServerContext,
      TNewClientContext
    >,
  ) => FunctionMiddlewareAfterClient<
    TRegister,
    TMiddlewares,
    TInputValidator,
    TSendServerContext,
    TNewClientContext
  >
}

export type FunctionMiddlewareClientFn<
  TRegister,
  TMiddlewares,
  TInputValidator,
  TSendContext,
  TClientContext,
> = (
  options: FunctionMiddlewareClientFnOptions<
    TRegister,
    TMiddlewares,
    TInputValidator
  >,
) => FunctionMiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext
>

export interface FunctionMiddlewareClientFnOptions<
  in out TRegister,
  in out TMiddlewares,
  in out TInputValidator,
> {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TInputValidator>>
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
  TRegister,
  TMiddlewares,
  TInputValidator,
  TServerSendContext,
  TClientContext,
> extends FunctionMiddlewareWithTypes<
      TRegister,
      TMiddlewares,
      TInputValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined
    >,
    FunctionMiddlewareServer<
      TRegister,
      TMiddlewares,
      TInputValidator,
      TServerSendContext,
      TClientContext
    > {}

export interface FunctionMiddlewareValidator<TRegister, TMiddlewares> {
  inputValidator: <TNewValidator>(
    inputValidator: ConstrainValidator<TRegister, 'GET', TNewValidator>,
  ) => FunctionMiddlewareAfterValidator<TRegister, TMiddlewares, TNewValidator>
}

export interface FunctionMiddlewareAfterValidator<
  TRegister,
  TMiddlewares,
  TInputValidator,
> extends FunctionMiddlewareWithTypes<
      TRegister,
      TMiddlewares,
      TInputValidator,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareServer<
      TRegister,
      TMiddlewares,
      TInputValidator,
      undefined,
      undefined
    >,
    FunctionMiddlewareClient<TRegister, TMiddlewares, TInputValidator> {}

export interface RequestMiddleware<TRegister>
  extends RequestMiddlewareAfterMiddleware<TRegister, undefined> {
  middleware: <const TMiddlewares = undefined>(
    middlewares: Constrain<TMiddlewares, ReadonlyArray<AnyRequestMiddleware>>,
  ) => RequestMiddlewareAfterMiddleware<TRegister, TMiddlewares>
}

export type AnyRequestMiddleware = RequestMiddlewareWithTypes<any, any, any>

export interface RequestMiddlewareWithTypes<
  TRegister,
  TMiddlewares,
  TServerContext,
> {
  _types: RequestMiddlewareTypes<TRegister, TMiddlewares, TServerContext>
  options: RequestMiddlewareOptions<TRegister, TMiddlewares, TServerContext>
}

export interface RequestMiddlewareOptions<
  in out TRegister,
  in out TMiddlewares,
  in out TServerContext,
> {
  middleware?: TMiddlewares
  server?: RequestServerFn<TRegister, TMiddlewares, TServerContext>
}
export interface RequestMiddlewareTypes<
  TRegister,
  TMiddlewares,
  TServerContext,
> {
  type: 'request'
  middlewares: TMiddlewares
  serverContext: TServerContext
  allServerContext: AssignAllServerRequestContext<
    TRegister,
    TMiddlewares,
    undefined,
    TServerContext
  >
}

export interface RequestMiddlewareAfterMiddleware<TRegister, TMiddlewares>
  extends RequestMiddlewareWithTypes<TRegister, TMiddlewares, undefined>,
    RequestMiddlewareServer<TRegister, TMiddlewares> {}

export interface RequestMiddlewareServer<TRegister, TMiddlewares> {
  server: <TServerContext = undefined>(
    fn: RequestServerFn<TRegister, TMiddlewares, TServerContext>,
  ) => RequestMiddlewareAfterServer<TRegister, TMiddlewares, TServerContext>
}

export type RequestServerFn<TRegister, TMiddlewares, TServerContext> = (
  options: RequestServerOptions<TRegister, TMiddlewares>,
) => RequestMiddlewareServerFnResult<TRegister, TMiddlewares, TServerContext>

export interface RequestServerOptions<TRegister, TMiddlewares> {
  request: Request
  pathname: string
  context: Expand<AssignAllServerRequestContext<TRegister, TMiddlewares>>
  next: RequestServerNextFn<TRegister, TMiddlewares>
}

export type RequestServerNextFn<TRegister, TMiddlewares> = <
  TServerContext = undefined,
>(
  options?: RequestServerNextFnOptions<TServerContext>,
) => RequestMiddlewareServerFnResult<TRegister, TMiddlewares, TServerContext>

export interface RequestServerNextFnOptions<TServerContext> {
  context?: TServerContext
}

export type RequestMiddlewareServerFnResult<
  TRegister,
  TMiddlewares,
  TServerContext,
> =
  | Promise<RequestServerResult<TRegister, TMiddlewares, TServerContext>>
  | RequestServerResult<TRegister, TMiddlewares, TServerContext>

export interface RequestServerResult<TRegister, TMiddlewares, TServerContext> {
  request: Request
  pathname: string
  context: Expand<
    AssignAllServerRequestContext<
      TRegister,
      TMiddlewares,
      undefined,
      TServerContext
    >
  >
  response: Response
}

export interface RequestMiddlewareAfterServer<
  TRegister,
  TMiddlewares,
  TServerContext,
> extends RequestMiddlewareWithTypes<TRegister, TMiddlewares, TServerContext> {}
