import type {
  ConstrainValidator,
  Method,
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
} from '@tanstack/react-router'

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
    : IntersectAssign<
        IntersectAllMiddleware<TMiddlewares, 'allInput'>,
        TValidator extends undefined
          ? undefined
          : ResolveValidatorInput<TValidator>
      >
/**
 * Recursively merge the output type produced by a sequence of middleware
 */
export type IntersectAllValidatorOutputs<TMiddlewares, TValidator> =
  unknown extends TValidator
    ? TValidator
    : IntersectAssign<
        IntersectAllMiddleware<TMiddlewares, 'allOutput'>,
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

export interface MiddlewareServerFnOptions<
  in out TMiddlewares,
  in out TValidator,
  in out TServerSendContext,
> {
  data: Expand<IntersectAllValidatorOutputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllServerContext<TMiddlewares, TServerSendContext>>
  next: MiddlewareServerNextFn<TMiddlewares, TServerSendContext>
  method: Method
  filename: string
  functionId: string
}

export type MiddlewareServerFn<
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TNewServerContext,
  TSendContext,
> = (
  options: MiddlewareServerFnOptions<
    TMiddlewares,
    TValidator,
    TServerSendContext
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
> {
  data: Expand<IntersectAllValidatorInputs<TMiddlewares, TValidator>>
  context: Expand<AssignAllClientContextBeforeNext<TMiddlewares>>
  sendContext: Expand<AssignAllServerSendContext<TMiddlewares>>
  method: Method
  next: MiddlewareClientNextFn<TMiddlewares>
  filename: string
  functionId: string
  type: ServerFnTypeOrTypeFn<Method, TMiddlewares, TValidator>
}

export type MiddlewareClientFn<
  TMiddlewares,
  TValidator,
  TSendContext,
  TClientContext,
> = (
  options: MiddlewareClientFnOptions<TMiddlewares, TValidator>,
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

export type AnyMiddleware = MiddlewareWithTypes<any, any, any, any, any, any>

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
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
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
    TMiddlewares,
    TValidator,
    TServerContext,
    TClientContext
  >
}

export interface MiddlewareAfterValidator<TMiddlewares, TValidator>
  extends MiddlewareWithTypes<
      TMiddlewares,
      TValidator,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    MiddlewareServer<TMiddlewares, TValidator, undefined, undefined>,
    MiddlewareClient<TMiddlewares, TValidator> {}

export interface MiddlewareValidator<TMiddlewares> {
  validator: <TNewValidator>(
    input: ConstrainValidator<TNewValidator>,
  ) => MiddlewareAfterValidator<TMiddlewares, TNewValidator>
}

export interface MiddlewareAfterServer<
  TMiddlewares,
  TValidator,
  TServerContext,
  TServerSendContext,
  TClientContext,
  TClientSendContext,
> extends MiddlewareWithTypes<
    TMiddlewares,
    TValidator,
    TServerContext,
    TServerSendContext,
    TClientContext,
    TClientSendContext
  > {}

export interface MiddlewareServer<
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> {
  server: <TNewServerContext = undefined, TSendContext = undefined>(
    server: MiddlewareServerFn<
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TNewServerContext,
      TSendContext
    >,
  ) => MiddlewareAfterServer<
    TMiddlewares,
    TValidator,
    TNewServerContext,
    TServerSendContext,
    TClientContext,
    TSendContext
  >
}

export interface MiddlewareAfterClient<
  TMiddlewares,
  TValidator,
  TServerSendContext,
  TClientContext,
> extends MiddlewareWithTypes<
      TMiddlewares,
      TValidator,
      undefined,
      TServerSendContext,
      TClientContext,
      undefined
    >,
    MiddlewareServer<
      TMiddlewares,
      TValidator,
      TServerSendContext,
      TClientContext
    > {}

export interface MiddlewareClient<TMiddlewares, TValidator> {
  client: <TSendServerContext = undefined, TNewClientContext = undefined>(
    client: MiddlewareClientFn<
      TMiddlewares,
      TValidator,
      TSendServerContext,
      TNewClientContext
    >,
  ) => MiddlewareAfterClient<
    TMiddlewares,
    TValidator,
    TSendServerContext,
    TNewClientContext
  >
}

export interface MiddlewareAfterMiddleware<TMiddlewares>
  extends MiddlewareWithTypes<
      TMiddlewares,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    >,
    MiddlewareServer<TMiddlewares, undefined, undefined, undefined>,
    MiddlewareClient<TMiddlewares, undefined>,
    MiddlewareValidator<TMiddlewares> {}

export interface Middleware extends MiddlewareAfterMiddleware<unknown> {
  middleware: <const TNewMiddlewares = undefined>(
    middlewares: Constrain<TNewMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => MiddlewareAfterMiddleware<TNewMiddlewares>
}

export function createMiddleware(
  options?: {
    validateClient?: boolean
  },
  __opts?: MiddlewareOptions<unknown, undefined, undefined, undefined>,
): Middleware {
  // const resolvedOptions = (__opts || options) as MiddlewareOptions<
  const resolvedOptions =
    __opts ||
    ((options || {}) as MiddlewareOptions<
      unknown,
      undefined,
      undefined,
      undefined
    >)

  return {
    options: resolvedOptions as any,
    middleware: (middleware: any) => {
      return createMiddleware(
        undefined,
        Object.assign(resolvedOptions, { middleware }),
      ) as any
    },
    validator: (validator: any) => {
      return createMiddleware(
        undefined,
        Object.assign(resolvedOptions, { validator }),
      ) as any
    },
    client: (client: any) => {
      return createMiddleware(
        undefined,
        Object.assign(resolvedOptions, { client }),
      ) as any
    },
    server: (server: any) => {
      return createMiddleware(
        undefined,
        Object.assign(resolvedOptions, { server }),
      ) as any
    },
  } as unknown as Middleware
}
