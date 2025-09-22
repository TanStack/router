import type {
  AnyContext,
  AnyRoute,
  Assign,
  Constrain,
  Expand,
  ResolveParams,
  UnionToIntersection,
} from '@tanstack/router-core'
import type {
  AnyRequestMiddleware,
  AssignAllServerRequestContext,
} from './createMiddleware'

declare module '@tanstack/router-core' {
  interface FilebaseRouteOptionsInterface<
    TRegister,
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
      TRegister,
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
    in out TRegister,
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
    allServerContext: ResolveAllServerContext<
      TRegister,
      TParentRoute,
      TServerMiddlewares
    >
  }

  interface BeforeLoadContextOptions<
    in out TRegister,
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
        ResolveAllServerContext<TRegister, TParentRoute, TServerMiddlewares>,
        ExtractHandlersContext<THandlers>
      >
    >
  }

  interface LoaderFnContext<
    in out TRegister,
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
        ResolveAllServerContext<TRegister, TParentRoute, TServerMiddlewares>,
        ExtractHandlersContext<THandlers>
      >
    >
  }
}

type ExtractHandlersContext<THandlers> =
  THandlers extends Record<
    string,
    RouteMethodHandlerFn<any, any, any, any, any, any>
  >
    ? THandlers extends Record<string, infer TRouteMethodHandler>
      ? UnionToIntersection<
          TRouteMethodHandler extends RouteMethodHandlerFn<
            any,
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
  TRegister,
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
              TRegister,
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
          opts: HandlersFnOpts<
            TRegister,
            TParentRoute,
            TPath,
            TServerMiddlewares
          >,
        ) => Partial<
          Record<
            RouteMethod,
            RouteMethodHandler<
              TRegister,
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
  TRegister,
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
      TRegister,
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
    >
  >
>

export interface HandlersFnOpts<
  TRegister,
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
> {
  createHandlers: CreateHandlersFn<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    any
  >
}

export type CreateHandlersFn<
  TRegister,
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
    TRegister,
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
  TRegister,
  TParentRoute,
  TPath,
  TServerMiddlewares,
  any,
  any
>

export interface CreateMethodFnOpts<
  TRegister,
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
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodAllMiddlewares,
    TServerFn
  >
  GET?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodGetMiddlewares,
    TServerFn
  >
  POST?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPostMiddlewares,
    TServerFn
  >
  PUT?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPutMiddlewares,
    TServerFn
  >
  PATCH?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodPatchMiddlewares,
    TServerFn
  >
  DELETE?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodDeleteMiddlewares,
    TServerFn
  >
  OPTIONS?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodOptionsMiddlewares,
    TServerFn
  >
  HEAD?: RouteMethodHandler<
    TRegister,
    TParentRoute,
    TPath,
    TServerMiddlewares,
    TMethodHeadMiddlewares,
    TServerFn
  >
}

export type RouteMethodHandler<
  TRegister,
  TParentRoute extends AnyRoute,
  TPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TServerFn,
> =
  | RouteMethodHandlerFn<
      TRegister,
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
    >
  | RouteMethodBuilderOptions<
      TRegister,
      TParentRoute,
      TPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TServerFn
    >

export interface RouteMethodBuilderOptions<
  TRegister,
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  handler?: RouteMethodHandlerFn<
    TRegister,
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
  TRegister,
  TParentRoute extends AnyRoute,
  TServerMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerRequestContext<TRegister, TServerMiddlewares, {}>
  : Assign<
      TParentRoute['types']['allServerContext'],
      AssignAllServerRequestContext<TRegister, TServerMiddlewares, {}>
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
  TRegister,
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TServerSendContext,
> = (
  ctx: RouteMethodHandlerCtx<
    TRegister,
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares
  >,
) =>
  | RouteMethodResult<TServerSendContext>
  | Promise<RouteMethodResult<TServerSendContext>>

export type RouteMethodResult<TContext> =
  | Response
  | undefined
  | RouteMethodNextResult<TContext>

export type RouteMethodNextResult<TContext> = {
  isNext: true
  context: TContext
}

export interface RouteMethodHandlerCtx<
  in out TRegister,
  in out TParentRoute extends AnyRoute,
  in out TFullPath extends string,
  in out TServerMiddlewares,
  in out TMethodMiddlewares,
> {
  context: Expand<
    Assign<
      TRegister extends { server: { requestContext: infer TRequestContext } }
        ? TRequestContext
        : AnyContext,
      AssignAllMethodContext<
        TRegister,
        TParentRoute,
        TServerMiddlewares,
        TMethodMiddlewares
      >
    >
  >
  request: Request
  params: Expand<ResolveParams<TFullPath>>
  pathname: TFullPath
  next: <const TContext>(options?: {
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
  TRegister,
  TParentRoute extends AnyRoute,
  TServerMiddlewares,
  TMethodMiddlewares,
> = ResolveAllServerContext<
  TRegister,
  TParentRoute,
  MergeMethodMiddlewares<TServerMiddlewares, TMethodMiddlewares>
>
