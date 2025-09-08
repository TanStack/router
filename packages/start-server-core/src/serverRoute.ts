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
    TServerSendContext = AnyContext,
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
      TServerMiddlewares,
      TServerSendContext
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
    in out TServerSendContext,
  > {
    serverContext?: Expand<
      Assign<
        ResolveAllServerContext<TParentRoute, TServerMiddlewares>,
        TServerSendContext
      >
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
    in out TServerSendContext = AnyContext,
  > {
    serverContext?: Expand<
      Assign<
        ResolveAllServerContext<TParentRoute, TServerMiddlewares>,
        TServerSendContext
      >
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
  TServerSendContext,
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
            TServerSendContext
          >
        >
      >
    | ((
        opts: HandlersFnOpts<TParentRoute, TPath, TServerMiddlewares>,
      ) => Partial<
        Record<
          RouteMethod,
          RouteMethodHandler<
            TParentRoute,
            TPath,
            TServerMiddlewares,
            unknown,
            TServerSendContext
          >
        >
      >)
}

export interface HandlersFnOpts<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> {
  createHandlers: CreateHandlersFn<TParentRoute, TPath, TServerMiddlewares, any>
}

export type CreateHandlersFn<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TServerSendContext,
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
    TMethodHeadMiddlewares,
    TServerSendContext
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
  TServerSendContext,
> {
  ALL?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodAllMiddlewares,
    TServerSendContext
  >
  GET?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodGetMiddlewares,
    TServerSendContext
  >
  POST?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPostMiddlewares,
    TServerSendContext
  >
  PUT?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPutMiddlewares,
    TServerSendContext
  >
  PATCH?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPatchMiddlewares,
    TServerSendContext
  >
  DELETE?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodDeleteMiddlewares,
    TServerSendContext
  >
  OPTIONS?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodOptionsMiddlewares,
    TServerSendContext
  >
  HEAD?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodHeadMiddlewares,
    TServerSendContext
  >
}

export type RouteMethodHandler<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TServerSendContext,
> =
  | RouteMethodHandlerFn<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerSendContext
    >
  | RouteMethodBuilderOptions<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerSendContext
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
  TServerSendContext,
> = (
  ctx: RouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares
  >,
) =>
  | RouteMethodResult<TServerSendContext>
  | Promise<RouteMethodResult<TServerSendContext>>

export type RouteMethodResult<TServerSendContext> =
  | Response
  | undefined
  | RouteMethodNextResult<TServerSendContext>

export type RouteMethodNextResult<TServerSendContext> = {
  isNext: true
  context: TServerSendContext
}

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
  next: <TContext>(options: {
    context?: TContext
  }) => RouteMethodNextResult<TContext>
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
