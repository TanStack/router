import { createFileRoute } from '../../react-router/src/fileRoute'
import type {
  AnyContext,
  AnyRoute,
  Assign,
  BaseRouteOptions,
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
  interface FileBaseRouteOptionsInterface<
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
    TMiddlewares = unknown,
  > {
    middleware?: Constrain<TMiddlewares, ReadonlyArray<AnyRequestMiddleware>>

    methods?: Record<
      string,
      | RouteMethodHandlerFn<TParentRoute, TPath, TMiddlewares, any, any>
      | {
          _options: RouteMethodBuilderOptions<
            TParentRoute,
            TPath,
            TMiddlewares,
            unknown,
            unknown
          >
        }
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
    in out TMiddlewares,
  > {
    middlewares: TMiddlewares
    allServerContext: ResolveAllServerContext<TParentRoute, TMiddlewares> // TODO:
  }
}

type Test = BaseRouteOptions<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>['middleware']

createFileRoute('/path')({
  middleware: [],
})

const createMethodBuilder = <
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
>(
  __opts?: RouteMethodBuilderOptions<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    unknown,
    unknown
  >,
): RouteMethodBuilder<TParentRoute, TFullPath, TMiddlewares> => {
  return {
    _options: (__opts || {}) as never,
    _types: {} as never,
    middleware: (middlewares) =>
      createMethodBuilder({
        ...__opts,
        middlewares,
      }) as never,
    handler: (handler) =>
      createMethodBuilder({
        ...__opts,
        handler: handler as never,
      }) as never,
  }
}

export interface RouteMethodBuilderOptions<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  handler?: RouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TMiddlewares,
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
  TMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerContext<TMiddlewares>
  : Assign<
      TParentRoute['types']['allServerContext'],
      AssignAllServerContext<TMiddlewares>
    >

export type RouteMethodsOptions<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
> =
  | RouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>
  | ((
      api: RouteMethodBuilder<TParentRoute, TFullPath, TMiddlewares>,
    ) => RouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>)

export interface RouteMethodsRecord<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
> {
  GET?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  POST?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  PUT?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  PATCH?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  DELETE?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  OPTIONS?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  HEAD?: RouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
}

export type RouteMethodRecordValue<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
> =
  | RouteMethodHandlerFn<TParentRoute, TFullPath, TMiddlewares, undefined, any>
  | AnyRouteMethodsBuilder

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
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> = (
  ctx: RouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares
  >,
) => TResponse | Promise<TResponse>

export interface RouteMethodHandlerCtx<
  in out TParentRoute extends AnyRoute,
  in out TFullPath extends string,
  in out TMiddlewares,
  in out TMethodMiddlewares,
> {
  context: Expand<
    AssignAllMethodContext<TParentRoute, TMiddlewares, TMethodMiddlewares>
  >
  request: Request
  params: Expand<ResolveParams<TFullPath>>
  pathname: TFullPath
}

export type MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares> =
  TMiddlewares extends ReadonlyArray<any>
    ? TMethodMiddlewares extends ReadonlyArray<any>
      ? readonly [...TMiddlewares, ...TMethodMiddlewares]
      : TMiddlewares
    : TMethodMiddlewares

export type AssignAllMethodContext<
  TParentRoute extends AnyRoute,
  TMiddlewares,
  TMethodMiddlewares,
> = ResolveAllServerContext<
  TParentRoute,
  MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>
>

export type AnyRouteMethodsBuilder = RouteMethodBuilderWithTypes<
  any,
  any,
  any,
  any,
  any
>

export interface RouteMethodBuilder<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
> extends RouteMethodBuilderWithTypes<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      undefined,
      undefined
    >,
    RouteMethodBuilderMiddleware<TParentRoute, TFullPath, TMiddlewares>,
    RouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      undefined
    > {}

export interface RouteMethodBuilderWithTypes<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  _options: RouteMethodBuilderOptions<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
  _types: RouteMethodBuilderTypes<
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface RouteMethodBuilderTypes<
  in out TFullPath extends string,
  in out TMiddlewares,
  in out TMethodMiddlewares,
  in out TResponse,
> {
  middlewares: TMiddlewares
  methodMiddleware: TMethodMiddlewares
  fullPath: TFullPath
  response: TResponse
}

export interface RouteMethodBuilderMiddleware<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<
      TNewMethodMiddlewares,
      ReadonlyArray<AnyRequestMiddleware>
    >,
  ) => RouteMethodBuilderAfterMiddleware<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface RouteMethodBuilderAfterMiddleware<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> extends RouteMethodBuilderWithTypes<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
    >,
    RouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares
    > {}

export interface RouteMethodBuilderHandler<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  handler: <TResponse>(
    handler: RouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      TResponse
    >,
  ) => RouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface RouteMethodBuilderAfterHandler<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> extends RouteMethodBuilderWithTypes<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  > {
  opts: RouteMethod<TParentRoute, TFullPath, TMiddlewares, TMethodMiddlewares>
}

export interface RouteMethod<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  middleware?: Constrain<TMiddlewares, Array<AnyRequestMiddleware>>
  handler?: RouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    undefined
  >
}
