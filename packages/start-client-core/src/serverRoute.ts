import type {
  AnyContext,
  AnyRoute,
  Assign,
  Constrain,
  Expand,
  Register,
  ResolveParams,
  UnionToIntersection,
} from '@tanstack/router-core'
import type {
  AnyRequestMiddleware,
  AssignAllServerContext,
} from './createMiddleware'

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
    THandlers = undefined,
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
      THandlers
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
    in out THandlers,
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
    in out THandlers,
  > {
    serverContext?: Expand<
      Assign<
        ResolveAllServerContext<TParentRoute, TServerMiddlewares>,
        ExtractHandlersContext<THandlers>
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
    in out THandlers = undefined,
  > {
    serverContext?: Expand<
      Assign<
        ResolveAllServerContext<TParentRoute, TServerMiddlewares>,
        ExtractHandlersContext<THandlers>
      >
    >
  }
}

type ExtractHandlersContext<THandlers> =
  THandlers extends Record<
    string,
    RouteMethodHandlerFn<any, any, any, any, any>
  >
    ? THandlers extends Record<string, infer TRouteMethodHandler>
      ? UnionToIntersection<
          TRouteMethodHandler extends RouteMethodHandlerFn<
            any,
            any,
            any,
            any,
            any
          >
            ? ReturnType<TRouteMethodHandler> extends RouteMethodNextResult<
                infer TContext
              >
              ? TContext
              : undefined
            : undefined
        >
      : undefined
    : undefined

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
  THandlers,
> {
  middleware?: Constrain<
    TServerMiddlewares,
    ReadonlyArray<AnyRequestMiddleware>
  >

  // handlers?: Constrain<
  //   THandlers,
  //   Partial<
  //     Record<
  //       RouteMethod,
  //       RouteMethodHandlerFn<TParentRoute, TPath, TServerMiddlewares, any, any>
  //     >
  //   >
  // >
  handlers?:
    | Constrain<
        THandlers,
        Partial<
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
      >
    | Constrain<
        THandlers,
        (
          opts: HandlersFnOpts<TParentRoute, TPath, TServerMiddlewares>,
        ) => Partial<
          Record<
            RouteMethod,
            RouteMethodHandler<
              TParentRoute,
              TPath,
              TServerMiddlewares,
              any,
              any
            >
          >
        >
      >
}

declare const createHandlersSymbol: unique symbol

type CustomHandlerFunctionsRecord<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TServerFn,
> = {
  [createHandlersSymbol]: true
} & Partial<
  Record<
    RouteMethod,
    RouteMethodHandler<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
    >
  >
>

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
  TServerFn,
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
    TServerFn
  >,
) => CustomHandlerFunctionsRecord<
  TParentRoute,
  TPath,
  TServerMiddlewares,
  any,
  any
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
  TServerFn,
> {
  ALL?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodAllMiddlewares,
    TServerFn
  >
  GET?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodGetMiddlewares,
    TServerFn
  >
  POST?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPostMiddlewares,
    TServerFn
  >
  PUT?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPutMiddlewares,
    TServerFn
  >
  PATCH?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPatchMiddlewares,
    TServerFn
  >
  DELETE?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodDeleteMiddlewares,
    TServerFn
  >
  OPTIONS?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodOptionsMiddlewares,
    TServerFn
  >
  HEAD?: RouteMethodHandler<
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodHeadMiddlewares,
    TServerFn
  >
}

export type RouteMethodHandler<
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TServerFn,
> =
  | RouteMethodHandlerFn<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
    >
  | RouteMethodBuilderOptions<
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
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

export type RouteMethod =
  | 'ALL'
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'

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

export type RouteMethodResult<TServerFn> =
  | Response
  | undefined
  | RouteMethodNextResult<TServerFn>

export type RouteMethodNextResult<TServerFn> = {
  isNext: true
  context: TServerFn
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
