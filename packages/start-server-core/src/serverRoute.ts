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
    server?: {
      middleware?: Constrain<
        TServerMiddlewares,
        ReadonlyArray<AnyRequestMiddleware>
      >

      methods?: Record<
        string,
        | RouteMethodHandlerFn<
            TParentRoute,
            TPath,
            TServerMiddlewares,
            any,
            any
          >
        | {
            _options: RouteMethodBuilderOptions<
              TParentRoute,
              TPath,
              TServerMiddlewares,
              unknown,
              unknown
            >
          }
      >
    }
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
  }
}

// createFileRoute('/path/$id')({
//   server: {
//     middleware: [],
//     methods: {
//       GET: {
//         _options: {
//           handler: (ctx) => {
//             return new Response('Hello, World!')
//           },
//         },
//       },
//     },
//   },
// })

const createMethodBuilder = <
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
>(
  __opts?: RouteMethodBuilderOptions<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    unknown,
    unknown
  >,
): RouteMethodBuilder<TParentRoute, TFullPath, TServerMiddlewares> => {
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
  ? AssignAllServerContext<TServerMiddlewares>
  : Assign<
      TParentRoute['types']['allServerContext'],
      AssignAllServerContext<TServerMiddlewares>
    >

export type RouteMethodsOptions<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
> =
  | RouteMethodsRecord<TParentRoute, TFullPath, TServerMiddlewares>
  | ((
      api: RouteMethodBuilder<TParentRoute, TFullPath, TServerMiddlewares>,
    ) => RouteMethodsRecord<TParentRoute, TFullPath, TServerMiddlewares>)

export interface RouteMethodsRecord<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
> {
  GET?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  POST?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  PUT?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  PATCH?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  DELETE?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  OPTIONS?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
  HEAD?: RouteMethodRecordValue<TParentRoute, TFullPath, TServerMiddlewares>
}

export type RouteMethodRecordValue<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
> =
  | RouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      undefined,
      any
    >
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
  TServerMiddlewares,
> extends RouteMethodBuilderWithTypes<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      undefined,
      undefined
    >,
    RouteMethodBuilderMiddleware<TParentRoute, TFullPath, TServerMiddlewares>,
    RouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      undefined
    > {}

export interface RouteMethodBuilderWithTypes<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  _options: RouteMethodBuilderOptions<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
  _types: RouteMethodBuilderTypes<
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface RouteMethodBuilderTypes<
  in out TFullPath extends string,
  in out TServerMiddlewares,
  in out TMethodMiddlewares,
  in out TResponse,
> {
  middlewares: TServerMiddlewares
  methodMiddleware: TMethodMiddlewares
  fullPath: TFullPath
  response: TResponse
}

export interface RouteMethodBuilderMiddleware<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<
      TNewMethodMiddlewares,
      ReadonlyArray<AnyRequestMiddleware>
    >,
  ) => RouteMethodBuilderAfterMiddleware<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface RouteMethodBuilderAfterMiddleware<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
> extends RouteMethodBuilderWithTypes<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      undefined
    >,
    RouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      TMethodMiddlewares
    > {}

export interface RouteMethodBuilderHandler<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
> {
  handler: <TResponse>(
    handler: RouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TServerMiddlewares,
      TMethodMiddlewares,
      TResponse
    >,
  ) => RouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface RouteMethodBuilderAfterHandler<
  TParentRoute extends AnyRoute,
  TFullPath extends string,
  TServerMiddlewares,
  TMethodMiddlewares,
  TResponse,
> extends RouteMethodBuilderWithTypes<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares,
    TResponse
  > {
  opts: RouteMethod<
    TParentRoute,
    TFullPath,
    TServerMiddlewares,
    TMethodMiddlewares
  >
}

export interface RouteMethod<
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
