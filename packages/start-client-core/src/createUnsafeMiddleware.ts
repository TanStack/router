import type { AnyServerFn, ConstrainValidator, Method } from './createServerFn'
import type {
  AnyContext,
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  ResolveValidatorInput,
  ResolveValidatorOutput,
  ValidateSerializableInput,
} from '@tanstack/router-core'

export function createUnsafeMiddleware<TType extends MiddlewareType>(
  options?: {
    type?: TType
  },
  __opts?: FunctionMiddlewareOptions<unknown, undefined, undefined, undefined>,
): CreateMiddlewareResult<TType> {
  const resolvedOptions = {
    type: 'request',
    ...(__opts ||
      (options as FunctionMiddlewareOptions<
        unknown,
        undefined,
        undefined,
        undefined
      >)),
  }

  return {
    options: resolvedOptions,
    middleware: (middleware: any) => {
      return createUnsafeMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    validator: (validator: any) => {
      return createUnsafeMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { validator }),
      ) as any
    },
    client: (client: any) => {
      return createUnsafeMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { client }),
      ) as any
    },
    server: (server: any) => {
      return createUnsafeMiddleware(
        {} as any,
        Object.assign(resolvedOptions, { server }),
      ) as any
    },
  } as unknown as CreateMiddlewareResult<TType>
}

export type MiddlewareType = 'request' | 'function'

export type CreateMiddlewareResult<TType extends MiddlewareType> =
  'request' extends TType ? RequestMiddleware : FunctionMiddleware

export interface FunctionMiddleware
  extends FunctionMiddlewareAfterMiddleware<unknown> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<
      TNewMiddlewares,
      ReadonlyArray<AnyUnsafeFunctionMiddleware>
    >,
  ) => FunctionMiddlewareAfterMiddleware<TNewMiddlewares>
}

export interface FunctionMiddlewareAfterMiddleware<TMiddlewares>
  extends FunctionMiddlewareWithTypes<
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareServer<TMiddlewares, undefined, undefined, undefined>,
    FunctionMiddlewareClient<TMiddlewares, undefined>,
    FunctionMiddlewareValidator<TMiddlewares> {}

export interface FunctionMiddlewareWithTypes<
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
  allServerContext: AssignAllServerFnContext<
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
    | keyof AnyUnsafeFunctionMiddleware['_types']
    | keyof AnyUnsafeRequestMiddleware['_types']
    | keyof AnyServerFn['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends
      | AnyUnsafeFunctionMiddleware
      | AnyUnsafeRequestMiddleware
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

export type AnyUnsafeFunctionMiddleware = FunctionMiddlewareWithTypes<
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
    | keyof AnyUnsafeFunctionMiddleware['_types']
    | keyof AnyUnsafeRequestMiddleware['_types']
    | keyof AnyServerFn['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends
      | AnyUnsafeFunctionMiddleware
      | AnyUnsafeRequestMiddleware
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
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = Assign<
  // Fetch Request Context
  // GlobalFetchRequestContext,
  AnyContext,
  any
  // __AssignAllServerRequestContext<TMiddlewares, TSendContext, TServerContext>
>

export type GlobalFetchRequestContext = AnyContext
// export type GlobalFetchRequestContext = Register extends {
//   server: { requestContext: infer TRequestContext }
// }
//   ? TRequestContext
//   : AnyContext

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
  TMiddlewares,
  TSendContext = undefined,
  TServerContext = undefined,
> = Assign<
  GlobalFetchRequestContext,
  __AssignAllServerFnContext<TMiddlewares, TSendContext, TServerContext>
>

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
  in out TMiddlewares,
  in out TValidator,
  in out TServerContext,
  in out TClientContext,
> {
  middleware?: TMiddlewares
  validator?: ConstrainValidator<any, 'GET', TValidator>
  client?: FunctionMiddlewareClientFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
  server?: FunctionMiddlewareServerFn<
    TMiddlewares,
    TValidator,
    TServerContext,
    unknown,
    unknown
  >
}

export type FunctionMiddlewareClientNextFn<TMiddlewares> = <
  TSendContext = undefined,
  TNewClientContext = undefined,
>(ctx?: {
  context?: TNewClientContext
  sendContext?: ValidateSerializableInput<any, TSendContext>
  headers?: HeadersInit
}) => Promise<
  FunctionClientResultWithContext<TMiddlewares, TSendContext, TNewClientContext>
>

export interface FunctionMiddlewareServer<
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: FunctionMiddlewareServerFn<
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext
    >,
  ) => FunctionMiddlewareAfterServer<
    TMiddlewares,
    TValidator,
    TNewServerContext,
    TServerSendContext,
    TClientContext,
    TSendContext
  >
}

export type FunctionMiddlewareServerFn<
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
> = (
  options: FunctionMiddlewareServerFnOptions<
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

export type FunctionMiddlewareServerNextFn<TMiddlewares, TServerSendContext> = <
  TNewServerContext = undefined,
  TSendContext = undefined,
>(ctx?: {
  context?: TNewServerContext
  sendContext?: ValidateSerializableInput<any, TSendContext>
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
    AssignAllServerFnContext<TMiddlewares, TServerSendContext, TServerContext>
  >
  sendContext: Expand<AssignAllClientSendContext<TMiddlewares, TSendContext>>
}

export interface FunctionMiddlewareServerFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerFnContext<TMiddlewares, TServerSendContext>>
  next: FunctionMiddlewareServerNextFn<TMiddlewares, TServerSendContext>
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
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
> extends FunctionMiddlewareWithTypes<
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  > {}

export interface FunctionMiddlewareClient<TMiddlewares, TValidator> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: FunctionMiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext
    >,
  ) => FunctionMiddlewareAfterClient<
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext
  >
}

export type FunctionMiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
> = (
  options: FunctionMiddlewareClientFnOptions<TMiddlewares, TValidator>,
) => FunctionMiddlewareClientFnResult<
  TMiddlewares,
  TSendContext,
  TClientContext
>

export interface FunctionMiddlewareClientFnOptions<
  in out TMiddlewares,
  in out TValidator,
> {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllClientContextBeforeNext<TMiddlewares>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares>>
  method: Method
  signal: AbortSignal
  next: FunctionMiddlewareClientNextFn<TMiddlewares>
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
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> extends FunctionMiddlewareWithTypes<
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined
    >,
    FunctionMiddlewareServer<
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext
    > {}

export interface FunctionMiddlewareValidator<TMiddlewares> {
  validator: <TNewValidator>(
    input: ConstrainValidator<any, 'GET', TNewValidator>,
  ) => FunctionMiddlewareAfterValidator<TMiddlewares, TNewValidator>
}

export interface FunctionMiddlewareAfterValidator<TMiddlewares, TValidator>
  extends FunctionMiddlewareWithTypes<
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    FunctionMiddlewareServer<TMiddlewares, TValidator, undefined, undefined>,
    FunctionMiddlewareClient<TMiddlewares, TValidator> {}

// export interface RequestMiddleware {}
export interface RequestMiddleware
  extends RequestMiddlewareAfterMiddleware<undefined> {
  middleware: <const TMiddlewares = undefined>(
    middlewares: Constrain<
      TMiddlewares,
      ReadonlyArray<AnyUnsafeRequestMiddleware>
    >,
  ) => RequestMiddlewareAfterMiddleware<TMiddlewares>
}

export type AnyUnsafeRequestMiddleware = RequestMiddlewareWithTypes<any, any>

export interface RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {
  // _types: RequestMiddlewareTypes<TMiddlewares, TServerContext>
  _types: any
  options: RequestMiddlewareOptions<TMiddlewares, TServerContext>
  // options: any
}

export interface RequestMiddlewareOptions<
  in out TMiddlewares,
  in out TServerContext,
> {
  middleware?: TMiddlewares
  server?: RequestServerFn<TMiddlewares, TServerContext> // TODO:
}

export interface RequestMiddlewareTypes<TMiddlewares, TServerContext> {
  unsafe: true
  type: 'request'
  middlewares: TMiddlewares
  serverContext: TServerContext
  allServerContext: AssignAllServerRequestContext<
    TMiddlewares,
    undefined,
    TServerContext
  > // TODO: Bad
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
  // options: any,
  options: RequestServerOptions<TMiddlewares>, // TODO:
) => any
// RequestMiddlewareServerFnResult<TMiddlewares, TServerContext>

export interface RequestServerOptions<TMiddlewares> {
  request: Request
  pathname: string
  context: Expand<AssignAllServerRequestContext<TMiddlewares>>
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
  // context: Expand<
  //   AssignAllServerRequestContext<TMiddlewares, undefined, TServerContext>
  // >
  context: any
  response: Response
}

export interface RequestMiddlewareAfterServer<TMiddlewares, TServerContext>
  extends RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {}
