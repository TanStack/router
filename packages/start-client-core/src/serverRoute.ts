import type {
  AnyMiddleware,
  AssignAllServerContext,
  IntersectAllValidatorOutputs,
  Middleware,
} from './createMiddleware'
import type {
  AnyRoute,
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  ResolveParams,
  RouteConstraints,
} from '@tanstack/router-core'
import type { ConstrainValidator, JsonResponse } from './createServerFn'

export const ServerRouteVerbs = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const
export type ServerRouteVerb = (typeof ServerRouteVerbs)[number]

export type ServerRouteMethodRecordValue<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> =
  | ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined,
      any
    >
  | AnyRouteMethodsBuilder

export interface ServerRouteMethodsRecord<TPath extends string, TMiddlewares> {
  GET?: ServerRouteMethodRecordValue<TPath, 'GET', TMiddlewares>
  POST?: ServerRouteMethodRecordValue<TPath, 'POST', TMiddlewares>
  PUT?: ServerRouteMethodRecordValue<TPath, 'PUT', TMiddlewares>
  PATCH?: ServerRouteMethodRecordValue<TPath, 'PATCH', TMiddlewares>
  DELETE?: ServerRouteMethodRecordValue<TPath, 'DELETE', TMiddlewares>
  OPTIONS?: ServerRouteMethodRecordValue<TPath, 'OPTIONS', TMiddlewares>
  HEAD?: ServerRouteMethodRecordValue<TPath, 'HEAD', TMiddlewares>
}

export type CreateServerFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = (options?: undefined) => ServerRoute<TPath>

export function createServerFileRoute<TPath extends string>(): (
  opts?: undefined,
  _opts?: ServerRouteOptions<TPath, any>,
) => ServerRoute<TPath> {
  return undefined as any
}

export interface ServerRouteOptions<TPath extends string, TMiddlewares> {
  middleware: Constrain<TMiddlewares, Middleware<any>>
  methods: ServerRouteMethods<TPath, ReadonlyArray<AnyMiddleware>>
}

export interface ServerRouteMiddleware<TPath extends string> {
  middleware: <const TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteAfterMiddleware<TPath, TNewMiddleware>
}

export type ServerRouteMethodsOptions<TPath extends string, TMiddlewares> =
  | ServerRouteMethodsRecord<TPath, TMiddlewares>
  | ((
      api: ServerRouteMethodBuilder<TPath, any, TMiddlewares>,
    ) => ServerRouteMethodsRecord<TPath, TMiddlewares>)

export interface ServerRouteMethods<TPath extends string, TMiddlewares> {
  methods: <const TMethods>(
    methodsOrGetMethods: Constrain<
      TMethods,
      ServerRouteMethodsOptions<TPath, TMiddlewares>
    >,
  ) => ServerRouteAfterMethods<TPath, TMiddlewares, TMethods>
}

export interface ServerRouteTypes<
  TPath extends string,
  TMiddlewares,
  TMethods,
> {
  path: TPath
  middlewares: TMiddlewares
  methods: TMethods
}

export interface ServerRouteWithTypes<
  TPath extends string,
  TMiddlewares,
  TMethods,
> {
  _types: ServerRouteTypes<TPath, TMiddlewares, TMethods>
}

export interface ServerRoute<TPath extends string>
  extends ServerRouteWithTypes<TPath, undefined, undefined>,
    ServerRouteMiddleware<TPath>,
    ServerRouteMethods<TPath, undefined> {}

export interface ServerRouteAfterMiddleware<TPath extends string, TMiddlewares>
  extends ServerRouteWithTypes<TPath, TMiddlewares, undefined>,
    ServerRouteMethods<TPath, TMiddlewares> {}

export interface ServerRouteAfterMethods<
  TPath extends string,
  TMiddlewares,
  TMethods,
> extends ServerRouteWithTypes<TPath, TMiddlewares, TMethods> {
  options: ServerRouteOptions<TPath, TMiddlewares>
  methods: ServerRouteMethodsClient<TMethods>
}

export type ServerRouteMethodsClient<TMethods> = {
  [TKey in keyof ResolveMethods<TMethods> as Lowercase<
    TKey & string
  >]: ServerRouteMethodClient<ResolveMethods<TMethods>[TKey]>
}

export type ResolveMethods<TMethods> = TMethods extends (
  ...args: Array<any>
) => infer TMethods
  ? TMethods
  : TMethods

export interface ServerRouteMethodClient<TMethod> {
  returns: ServerRouteMethodClientReturns<TMethod>
  (): Promise<ServerRouteMethodClientReturns<TMethod>>
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

export interface ServerRouteMethodBuilderTypes<
  TPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> {
  middlewares: TMiddlewares
  methodMiddleware: TMethodMiddlewares
  validator: TValidator
  path: TPath
  response: TResponse
}

export interface ServerRouteMethodBuilderWithTypes<
  TPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> {
  _types: ServerRouteMethodBuilderTypes<
    TPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  >
}

export type AnyRouteMethodsBuilder = ServerRouteMethodBuilderWithTypes<
  any,
  any,
  any,
  any,
  any
>

export interface ServerRouteMethodBuilder<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TPath,
      TMiddlewares,
      undefined,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderMiddleware<TPath, TVerb, TMiddlewares>,
    ServerRouteMethodBuilderValidator<TPath, TVerb, TMiddlewares, undefined>,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined
    > {}

export interface ServerRouteMethodBuilderMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<TNewMethodMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteMethodsBuilderAfterMiddleware<
    TPath,
    TVerb,
    TMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface ServerRouteMethodsBuilderAfterMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderValidator<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    >,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
    > {}

export interface ServerRouteMethodBuilderValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
  TMethodMiddlewares,
> {
  validator: <TValidator>(
    validator: ConstrainValidator<TValidator>,
  ) => ServerRouteMethodBuilderAfterValidator<
    TPath,
    TVerb,
    TMiddleware,
    TMethodMiddlewares,
    TValidator
  >
}

export interface ServerRouteMethodBuilderAfterValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> extends ServerRouteMethodBuilderWithTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator,
      undefined
    >,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    > {}

export interface ServerRouteMethodBuilderHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  handler: <TResponse>(
    handler: ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator,
      TResponse
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  >
}

export interface ServerRouteMethod<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  middleware?: Constrain<TMiddlewares, Middleware<any>>
  validator?: ServerRouteMethodValidator<TPath, TVerb, TMiddlewares>
  handler?: ServerRouteMethodHandlerFn<
    TPath,
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

export type ServerRouteMethodHandlerFn<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >,
) => TResponse | Promise<TResponse>

export type AssignAllMethodContext<TMiddlewares, TMethodMiddlewares> = Assign<
  AssignAllServerContext<TMiddlewares>,
  AssignAllServerContext<TMethodMiddlewares>
>

export type IntersectAllMethodValidatorOutputs<
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> = IntersectAssign<
  IntersectAllValidatorOutputs<TMiddlewares, undefined>,
  IntersectAllValidatorOutputs<TMethodMiddlewares, TValidator>
>

export interface ServerRouteMethodHandlerCtx<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  data: Expand<
    IntersectAllMethodValidatorOutputs<
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    >
  >
  context: Expand<AssignAllMethodContext<TMiddlewares, TMethodMiddlewares>>
  request: Request
  params: ResolveParams<TPath>
  pathname: TPath
}

export interface ServerRouteMethodBase<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: Array<Middleware<any>>
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<
    TPath,
    TVerb,
    TMiddlewares,
    undefined,
    undefined
  >
  handler: (
    handler: ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined,
      undefined
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    undefined,
    undefined,
    undefined
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
  TResponse,
> extends ServerRouteMethodBuilderWithTypes<
    TPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator,
    TResponse
  > {
  opts: ServerRouteMethod<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
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

function createMethodFn<TVerb extends ServerRouteVerb>(verb: TVerb) {
  return function createMethod<TPath extends string>(
    opts: ServerRouteMethodOptions<TPath, TVerb>,
  ): ServerRouteMethodBase<TPath, TVerb, any> {
    return undefined as any
  }
}

export interface ServerRouteMethodOptions<
  TPath extends string,
  TVerb extends ServerRouteVerb,
> {
  middleware: Array<Middleware<any>>
}
