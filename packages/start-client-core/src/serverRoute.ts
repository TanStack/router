import type {
  AnyMiddleware,
  AssignAllServerContext,
  IntersectAllValidatorInputs,
  IntersectAllValidatorOutputs,
  Middleware,
} from './createMiddleware'
import type {
  Assign,
  Constrain,
  Expand,
  ResolveParams,
  RouteConstraints,
  Validator,
} from '@tanstack/router-core'
import type { JsonResponse } from './createServerFn'

type TODO = any

export function createServerFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
>(): ServerRoute<TParentRoute, TId, TPath, TFullPath> {
  return createServerRoute<TParentRoute, TId, TPath, TFullPath>()
}

export function createServerRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
>(
  __?: never,
  __opts?: ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, undefined>,
): ServerRoute<TParentRoute, TId, TPath, TFullPath> {
  const resolvedOpts = (__opts || {}) as ServerRouteOptions<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    undefined
  >

  return {
    options: resolvedOpts,
    _types: {} as TODO,
    middleware: (middlewares) =>
      createServerRoute(undefined, {
        ...resolvedOpts,
        middleware: middlewares,
      }) as TODO,
    methods: (methodsOrGetMethods) => {
      const methods = (() => {
        if (typeof methodsOrGetMethods === 'function') {
          return methodsOrGetMethods(createMethodBuilder())
        }

        return methodsOrGetMethods
      })()

      return createServerRoute(undefined, {
        ...__opts,
        methods,
      } as TODO) as TODO
    },
    client: new Proxy(
      {},
      {
        get(target, propKey) {
          return (...args: Array<any>) => {
            if (typeof propKey === 'string') {
              const method = resolvedOpts.methods[propKey]
              if (method) {
                return method(...args)
              }
            }
            throw new Error(`Method ${String(propKey)} not found`)
          }
        },
      },
    ),
  } as ServerRouteAfterMethods<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    ReadonlyArray<AnyMiddleware>,
    any
  >
}

const createMethodBuilder = <
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
>(
  __opts?: TODO,
): ServerRouteMethodBuilder<TParentRoute, TFullPath, TVerb, TMiddlewares> => {
  return {
    _options: __opts || {},
    _types: {} as TODO,
    middleware: (middlewares) =>
      createMethodBuilder({
        ...__opts,
        middlewares,
      }) as TODO,
    validator: (validator) =>
      createMethodBuilder({
        ...__opts,
        validator,
      }) as TODO,
    handler: (handler) =>
      createMethodBuilder({
        ...__opts,
        handler,
      }) as TODO,
  }
}

export type CreateServerFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = (options?: undefined) => ServerRoute<TParentRoute, TId, TPath, TFullPath>

export type AnyServerRouteWithTypes = ServerRouteWithTypes<
  any,
  any,
  any,
  any,
  any,
  any
>

export interface ServerRouteWithTypes<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TMethods,
> {
  _types: ServerRouteTypes<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods
  >
}

export interface ServerRouteTypes<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TMethods,
> {
  id: TId
  path: TPath
  fullPath: TFullPath
  middlewares: TMiddlewares
  methods: TMethods
  parentRoute: TParentRoute
  allContext: ResolveAllServerContext<TParentRoute, TMiddlewares>
}

export type ResolveAllServerContext<
  TParentRoute extends AnyServerRouteWithTypes,
  TMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerContext<TMiddlewares>
  : Assign<
      TParentRoute['_types']['allContext'],
      AssignAllServerContext<TMiddlewares>
    >

export interface ServerRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> extends ServerRouteWithTypes<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      undefined,
      undefined
    >,
    ServerRouteMiddleware<TParentRoute, TId, TPath, TFullPath>,
    ServerRouteMethods<TParentRoute, TId, TPath, TFullPath, undefined> {}

export interface ServerRouteMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> {
  middleware: <const TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteAfterMiddleware<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TNewMiddleware
  >
}

export interface ServerRouteAfterMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
> extends ServerRouteWithTypes<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      TMiddlewares,
      undefined
    >,
    ServerRouteMethods<TParentRoute, TId, TPath, TFullPath, TMiddlewares> {}

export interface ServerRouteMethods<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
> {
  methods: <const TMethods>(
    methodsOrGetMethods: Constrain<
      TMethods,
      ServerRouteMethodsOptions<TParentRoute, TFullPath, TMiddlewares>
    >,
  ) => ServerRouteAfterMethods<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods
  >
}

export type ServerRouteMethodsOptions<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> =
  | ServerRouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>
  | ((
      api: ServerRouteMethodBuilder<TParentRoute, TFullPath, any, TMiddlewares>,
    ) => ServerRouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>)

export interface ServerRouteMethodsRecord<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> {
  GET?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'GET',
    TMiddlewares
  >
  POST?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'POST',
    TMiddlewares
  >
  PUT?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'PUT',
    TMiddlewares
  >
  PATCH?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'PATCH',
    TMiddlewares
  >
  DELETE?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'DELETE',
    TMiddlewares
  >
  OPTIONS?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'OPTIONS',
    TMiddlewares
  >
  HEAD?: ServerRouteMethodRecordValue<
    TParentRoute,
    TFullPath,
    'HEAD',
    TMiddlewares
  >
}

export type ServerRouteMethodRecordValue<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> =
  | ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined,
      any
    >
  | AnyRouteMethodsBuilder

export type ServerRouteVerb = (typeof ServerRouteVerbs)[number]

export const ServerRouteVerbs = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const

export type ServerRouteMethodHandlerFn<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >,
) => TResponse | Promise<TResponse>

export interface ServerRouteMethodHandlerCtx<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  data: Expand<
    ResolveAllMethodValidatorOutputs<
      TParentRoute,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    >
  >
  context: Expand<
    AssignAllMethodContext<TParentRoute, TMiddlewares, TMethodMiddlewares>
  >
  request: Request
  params: ResolveParams<TFullPath>
  pathname: TFullPath
}

export type ResolveAllMethodValidatorOutputs<
  TParentRoute extends AnyServerRouteWithTypes,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> = IntersectAllValidatorOutputs<
  MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>,
  TValidator
>

export type MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares> =
  TMiddlewares extends ReadonlyArray<any>
    ? TMethodMiddlewares extends ReadonlyArray<any>
      ? readonly [...TMiddlewares, ...TMethodMiddlewares]
      : TMiddlewares
    : TMethodMiddlewares

export type AssignAllMethodContext<
  TParentRoute extends AnyServerRouteWithTypes,
  TMiddlewares,
  TMethodMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerContext<
      MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>
    >
  : Assign<
      TParentRoute['_types']['allContext'],
      AssignAllServerContext<
        MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>
      >
    >

export type AnyRouteMethodsBuilder = ServerRouteMethodBuilderWithTypes<
  any,
  any,
  any,
  any,
  any
>

export interface ServerRouteMethodBuilder<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TFullPath,
      TMiddlewares,
      undefined,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderMiddleware<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares
    >,
    ServerRouteMethodBuilderValidator<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      undefined
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined
    > {}

export interface ServerRouteMethodBuilderWithTypes<
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> {
  _options: TODO
  _types: ServerRouteMethodBuilderTypes<
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  >
}

export interface ServerRouteMethodBuilderTypes<
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> {
  middlewares: TMiddlewares
  methodMiddleware: TMethodMiddlewares
  validator: TValidator
  fullPath: TFullPath
  response: TResponse
  allInput: ResolveAllMethodValidatorInput<
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >
}

export type ResolveAllMethodValidatorInput<
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> = IntersectAllValidatorInputs<
  MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>,
  TValidator
>

export interface ServerRouteMethodBuilderMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<TNewMethodMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteMethodBuilderAfterMiddleware<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface ServerRouteMethodBuilderAfterMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderValidator<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
    > {}

export interface ServerRouteMethodBuilderValidator<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
  TMethodMiddlewares,
> {
  validator: <TValidator>(
    validator: Constrain<TValidator, Validator<ValidatorInput<TFullPath>, any>>,
  ) => ServerRouteMethodBuilderAfterValidator<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddleware,
    TMethodMiddlewares,
    TValidator
  >
}

export interface ValidatorInput<TFullPath extends string> {
  body?: unknown
  search?: Record<string, unknown>
  params?: ResolveParams<TFullPath>
  headers?: Record<string, unknown>
}

export interface ServerRouteMethodBuilderAfterValidator<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> extends ServerRouteMethodBuilderWithTypes<
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator,
      undefined
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    > {}

export interface ServerRouteMethodBuilderHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  handler: <TResponse>(
    handler: ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator,
      TResponse
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> extends ServerRouteMethodBuilderWithTypes<
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  > {
  opts: ServerRouteMethod<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >
}

export interface ServerRouteMethod<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  middleware?: Constrain<TMiddlewares, Middleware<any>>
  validator?: ServerRouteMethodValidator<TFullPath, TVerb, TMiddlewares>
  handler?: ServerRouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    undefined
  >
}

type ServerRouteMethodValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> = 'TODO'

export interface ServerRouteAfterMethods<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TMethods,
> extends ServerRouteWithTypes<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods
  > {
  options: ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, TMiddlewares>
  client: ServerRouteMethodsClient<TFullPath, TMethods>
}

export interface ServerRouteOptions<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
> {
  middleware: Constrain<TMiddlewares, Middleware<any>>
  methods: ServerRouteMethods<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    ReadonlyArray<AnyMiddleware>
  >
}

export type ServerRouteMethodsClient<TFullPath extends string, TMethods> = {
  [TKey in keyof ResolveMethods<TMethods> as Lowercase<
    TKey & string
  >]: ServerRouteMethodClient<TFullPath, ResolveMethods<TMethods>[TKey]>
}

export type ResolveMethods<TMethods> = TMethods extends (
  ...args: Array<any>
) => infer TMethods
  ? TMethods
  : TMethods

export interface ServerRouteMethodClient<TFullPath extends string, TMethod> {
  returns: ServerRouteMethodClientReturns<TMethod>
  (
    ...args: ServerRouteMethodClientOptions<TFullPath, TMethod>
  ): Promise<ServerRouteMethodClientReturns<TMethod>>
}

export type ServerRouteMethodClientReturns<TMethod> =
  ServerRouteMethodClientResponse<TMethod> extends JsonResponse<any>
    ? Awaited<ReturnType<ServerRouteMethodClientResponse<TMethod>['json']>>
    : Awaited<ServerRouteMethodClientResponse<TMethod>>

export type ServerRouteMethodClientResponse<TMethod> =
  TMethod extends AnyRouteMethodsBuilder
    ? TMethod['_types']['response']
    : TMethod extends (...args: Array<any>) => infer TReturn
      ? Awaited<TReturn>
      : never

export type ServerRouteMethodClientOptions<TFullPath extends string, TMethod> =
  {} extends ServerRouteMethodClientInput<TFullPath, TMethod>
    ? [options?: Expand<ServerRouteMethodClientInput<TFullPath, TMethod>>]
    : [options: Expand<ServerRouteMethodClientInput<TFullPath, TMethod>>]

export type ServerRouteMethodClientInput<
  TFullPath extends string,
  TMethod,
> = TMethod extends AnyRouteMethodsBuilder
  ? undefined extends TMethod['_types']['allInput']
    ? DefaultServerRouteMethodClientInput<TFullPath>
    : TMethod['_types']['allInput'] extends { params: any }
      ? TMethod['_types']['allInput']
      : TMethod['_types']['allInput'] &
          DefaultServerRouteMethodClientInput<TFullPath>
  : DefaultServerRouteMethodClientInput<TFullPath>

export type DefaultServerRouteMethodClientInput<TFullPath extends string> =
  {} extends ResolveParams<TFullPath>
    ? { params?: ResolveParams<TFullPath> }
    : { params: ResolveParams<TFullPath> }

function createMethodFn<TVerb extends ServerRouteVerb>(verb: TVerb) {
  return function createMethod<TPath extends string>(
    opts: ServerRouteMethodOptions<TPath, TVerb>,
  ): ServerRouteMethodBase<any, TPath, TVerb, any> {
    return undefined as any
  }
}

export interface ServerRouteMethodOptions<
  TPath extends string,
  TVerb extends ServerRouteVerb,
> {
  middleware: Array<Middleware<any>>
}

export interface ServerRouteMethodBase<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: Array<Middleware<any>>
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    undefined,
    undefined
  >
  handler: (
    handler: ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined,
      undefined
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    undefined,
    undefined,
    undefined
  >
}

export const methods = {
  createGet: createMethodFn('GET'),
  createPost: createMethodFn('POST'),
  createPut: createMethodFn('PUT'),
  createPatch: createMethodFn('PATCH'),
  createDelete: createMethodFn('DELETE'),
  createOptions: createMethodFn('OPTIONS'),
  createHead: createMethodFn('HEAD'),
}
