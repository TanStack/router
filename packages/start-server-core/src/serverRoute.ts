import type {
  AnyContext,
  AnyRoute,
  Assign,
  Constrain,
  Expand,
  Register,
  ResolveParams,
} from '@tanstack/router-core'
import type {
  AnyRequestMiddleware,
  AssignAllServerContext,
} from '@tanstack/start-client-core'

declare module '@tanstack/router-core' {
  interface FilebaseRouteOptionsInterface<
    TRegister extends Register,
    TParentRoute extends AnyRoute = AnyRoute,
    TId extends string = string,
    TPath extends string = string,
    TSearchValidator = undefined,
    TParams = {},
    TLoaderDeps extends Record<string, any> = {},
    TLoaderFn = undefined,
    TRouterContext = {},
    TRouteContextFn = AnyContext,
    TBeforeLoadFn = AnyContext,
    TRemountDepsFn = AnyContext,
    TSSR = unknown,
    TServerMiddlewares = unknown,
  > {
    server?: RouteServerOptions<
      TParentRoute,
      TPath,
      TParams,
      TLoaderDeps,
      TLoaderFn,
      TRouterContext,
      TRouteContextFn,
      TBeforeLoadFn,
      TServerMiddlewares
    >
  }

  interface RouteTypes<
    in out TParentRoute extends AnyRoute,
    in out TPath extends string,
    in out TFullPath extends string,
    in out TCustomId extends string,
    in out TId extends string,
    in out TSearchValidator,
    in out TParams,
    in out TRouterContext,
    in out TRouteContextFn,
    in out TBeforeLoadFn,
    in out TLoaderDeps,
    in out TLoaderFn,
    in out TChildren,
    in out TFileRouteTypes,
    in out TSSR,
    in out TServerMiddlewares,
  > {
    middlewares: TServerMiddlewares
    allServerContext: ResolveAllServerContext<TParentRoute, TServerMiddlewares>
  }

  interface BeforeLoadContextOptions<
    in out TParentRoute extends AnyRoute,
    in out TSearchValidator,
    in out TParams,
    in out TRouterContext,
    in out TRouteContextFn,
    in out TServerMiddlewares,
  > {
    serverContext?: Expand<
      ResolveAllServerContext<TParentRoute, TServerMiddlewares>
    >
  }
}

export interface RouteServerOptions<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TParams,
  TLoaderDeps,
  TLoaderFn,
  TRouterContext,
  TRouteContextFn,
  TBeforeLoadFn,
  TServerMiddlewares,
> {
  middleware?: Constrain<
    TServerMiddlewares,
    ReadonlyArray<AnyRequestMiddleware>
  >

  methods?:
    | RouteMethodsRecord<TParentRoute, TPath, TServerMiddlewares>
    | ((
        createMethod: CreateMethodFn<TParentRoute, TPath, TServerMiddlewares>,
      ) => RouteMethodsOrOptionsRecord<TParentRoute, TPath, TServerMiddlewares>)
}

export type CreateMethodFn<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> = <const TMethodMiddlewares>(
  opts: CreateMethodFnOpts<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodMiddlewares
  >,
) => RouteMethodBuilderResult<TParentRoute, TPath, TServerMiddlewares>

export interface CreateMethodFnOpts<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
> {
  middleware: Constrain<TMethodMiddlewares, ReadonlyArray<AnyRequestMiddleware>>
  handler: RouteMethodHandlerFn<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    any
  >
}

export interface RouteMethodsRecord<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> {
  GET?: RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
  POST?: RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
  PUT?: RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
  PATCH?: RouteMethodHandlerFn<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    any,
    any
  >
  DELETE?: RouteMethodHandlerFn<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    any,
    any
  >
  OPTIONS?: RouteMethodHandlerFn<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    any,
    any
  >
  HEAD?: RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
}

export interface RouteMethodsOrOptionsRecord<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> {
  GET?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  POST?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  PUT?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  PATCH?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  DELETE?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  OPTIONS?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
  HEAD?: RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares>
}

export type RouteMethodHandler<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> =
  | RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
  | RouteMethodBuilderResult<TParentRoute, TPath, TServerMiddlewares>

export type RouteMethodBuilderResult<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> = {
  _options: RouteMethodBuilderOptions<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    unknown,
    unknown
  >
}

export interface RouteMethodBuilderOptions<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  handler?: RouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
  middlewares?: Constrain<
    TMethodMiddlewares,
    ReadonlyArray<AnyRequestMiddleware>
  >
}

export type ResolveAllServerContext<
  TParentRoute extends AnyRoute,
  TServerMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerContext<TServerMiddlewares, {}>
  : Assign<
      TParentRoute['types']['allServerContext'],
      AssignAllServerContext<TServerMiddlewares, {}>
    >

export type RouteVerb = (typeof RouteVerbs)[number]

export const RouteVerbs = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const

export type RouteMethodHandlerFn<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TResponse,
> = (
  ctx: RouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares
  >,
) => TResponse | Promise<TResponse>

export interface RouteMethodHandlerCtx<
  in out TParentRoute extends AnyRoute,
  in out TFullPath extends string,
  in out TServerMiddlewares,
  in out TMethodMiddlewares,
> {
  context: Expand<
    AssignAllMethodContext<TParentRoute, TServerMiddlewares, TMethodMiddlewares>
  >
  request: Request
  params: Expand<ResolveParams<TFullPath>>
  pathname: TFullPath
}

export type MergeMethodMiddlewares<TServerMiddlewares, TMethodMiddlewares> =
  TServerMiddlewares extends ReadonlyArray<any>
    ? TMethodMiddlewares extends ReadonlyArray<any>
      ? readonly [...TServerMiddlewares, ...TMethodMiddlewares]
      : TServerMiddlewares
    : TMethodMiddlewares

export type AssignAllMethodContext<
  TParentRoute extends AnyRoute,
  TServerMiddlewares,
  TMethodMiddlewares,
> = ResolveAllServerContext<
  TParentRoute,
  MergeMethodMiddlewares<TServerMiddlewares, TMethodMiddlewares>
>

export interface RouteMethodWithMiddleware<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
> {
  middleware?: Constrain<TServerMiddlewares, Array<AnyRequestMiddleware>>
  handler?: RouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    undefined
  >
}
