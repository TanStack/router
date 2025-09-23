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
    middleware: TServerMiddlewares
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

  interface LoaderFnContext<
    in out TParentRoute extends AnyRoute = AnyRoute,
    in out TId extends string = string,
    in out TParams = {},
    in out TLoaderDeps = {},
    in out TRouterContext = {},
    in out TRouteContextFn = AnyContext,
    in out TBeforeLoadFn = AnyContext,
    in out TServerMiddlewares = unknown,
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

  handlers?:
    | Partial<
        Record<
          RouteMethod,
          RouteMethodHandlerFn<
            TParentRoute,
            TPath,
            TServerMiddlewares,
            any,
            any
          >
        >
      >
    | ((
        opts: HandlersFnOpts<TParentRoute, TPath, TServerMiddlewares>,
      ) => Partial<
        Record<
          RouteMethod,
          RouteMethodHandler<TParentRoute, TPath, TServerMiddlewares, unknown>
        >
      >)
}

export interface HandlersFnOpts<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> {
  createHandlers: CreateHandlersFn<TParentRoute, TPath, TServerMiddlewares>
}

export type CreateHandlersFn<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> = <
  const TMethodAllMiddlewares,
  const TMethodGetMiddlewares,
  const TMethodPostMiddlewares,
  const TMethodPutMiddlewares,
  const TMethodPatchMiddlewares,
  const TMethodDeleteMiddlewares,
  const TMethodOptionsMiddlewares,
  const TMethodHeadMiddlewares,
>(
  opts: CreateMethodFnOpts<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodAllMiddlewares,
    TMethodGetMiddlewares,
    TMethodPostMiddlewares,
    TMethodPutMiddlewares,
    TMethodPatchMiddlewares,
    TMethodDeleteMiddlewares,
    TMethodOptionsMiddlewares,
    TMethodHeadMiddlewares
  >,
) => Partial<
  Record<
    RouteMethod,
    RouteMethodBuilderOptions<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      unknown,
      any
    >
  >
>

export interface CreateMethodFnOpts<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodAllMiddlewares,
  TMethodGetMiddlewares,
  TMethodPostMiddlewares,
  TMethodPutMiddlewares,
  TMethodPatchMiddlewares,
  TMethodDeleteMiddlewares,
  TMethodOptionsMiddlewares,
  TMethodHeadMiddlewares,
> {
  ALL?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodAllMiddlewares
  >
  GET?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodGetMiddlewares
  >
  POST?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPostMiddlewares
  >
  PUT?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPutMiddlewares
  >
  PATCH?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPatchMiddlewares
  >
  DELETE?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodDeleteMiddlewares
  >
  OPTIONS?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodOptionsMiddlewares
  >
  HEAD?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodHeadMiddlewares
  >
}

export type RouteMethodHandler<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
> =
  | RouteMethodHandlerFn<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      any
    >
  | RouteMethodBuilderOptions<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      any
    >

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
  middleware?: Constrain<
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

export type RouteMethod = (typeof RouteMethods)[number]

export const RouteMethods = [
  'ALL',
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
