import { joinPaths, rootRouteId, trimPathLeft } from '@tanstack/router-core'
import type {
  Assign,
  Constrain,
  Expand,
  ResolveParams,
  RouteConstraints,
  TrimPathRight,
} from '@tanstack/router-core'
import type {
  AnyRequestMiddleware,
  AssignAllServerContext,
} from '@tanstack/start-client-core'

type TODO = any

export function createServerFileRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
>(__?: never): ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren> {
  return createServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren>(
    undefined,
  )
}

export interface ServerRouteOptions<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
> {
  id: TId
  path: TPath
  pathname: TFullPath
  originalIndex: number
  getParentRoute?: () => TParentRoute
  middleware: Constrain<TMiddlewares, ReadonlyArray<AnyRequestMiddleware>>
  methods: Record<
    string,
    ServerRouteMethodHandlerFn<TParentRoute, TFullPath, TMiddlewares, any, any>
  >
  caseSensitive?: boolean
}

export type ServerRouteManifest = {
  middleware: boolean
  methods: Record<string, { middleware: boolean }>
}

export function createServerRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
>(
  __?: never,
  __opts?: Partial<
    ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, undefined>
  >,
): ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren> {
  const options = __opts || {}

  const route: ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren> = {
    path: '' as TPath,
    id: '' as TId,
    fullPath: '' as TFullPath,
    to: '' as TrimPathRight<TFullPath>,
    options: options as TODO,
    parentRoute: undefined as unknown as TParentRoute,
    _types: {} as TODO,
    // children: undefined as TChildren,
    middleware: (middlewares: TODO) =>
      createServerRoute(undefined, {
        ...options,
        middleware: middlewares,
      }) as TODO,
    methods: (methodsOrGetMethods: TODO) => {
      const methods = (() => {
        if (typeof methodsOrGetMethods === 'function') {
          return methodsOrGetMethods(createMethodBuilder())
        }

        return methodsOrGetMethods
      })()

      return createServerRoute(undefined, {
        ...__opts,
        methods,
      }) as TODO
    },
    update: (opts) =>
      createServerRoute(undefined, {
        ...options,
        ...opts,
      }) as TODO,
    init: (opts: { originalIndex: number }): void => {
      options.originalIndex = opts.originalIndex

      const isRoot = !options.path && !options.id

      route.parentRoute = options.getParentRoute?.() as TParentRoute

      if (isRoot) {
        route.path = rootRouteId as TPath
      } else if (!(route.parentRoute as any)) {
        throw new Error(
          `Child Route instances must pass a 'getParentRoute: () => ParentRoute' option that returns a ServerRoute instance.`,
        )
      }

      let path: undefined | string = isRoot ? rootRouteId : options.path

      // If the path is anything other than an index path, trim it up
      if (path && path !== '/') {
        path = trimPathLeft(path)
      }

      const customId = options.id || path

      // Strip the parentId prefix from the first level of children
      let id = isRoot
        ? rootRouteId
        : joinPaths([
            route.parentRoute.id === rootRouteId ? '' : route.parentRoute.id,
            customId,
          ])

      if (path === rootRouteId) {
        path = '/'
      }

      if (id !== rootRouteId) {
        id = joinPaths(['/', id])
      }

      const fullPath =
        id === rootRouteId ? '/' : joinPaths([route.parentRoute.fullPath, path])

      route.path = path as TPath
      route.id = id as TId
      route.fullPath = fullPath as TFullPath
      route.to = fullPath as TrimPathRight<TFullPath>
    },

    _addFileChildren: (children) => {
      if (Array.isArray(children)) {
        route.children = children as TChildren as TODO
      }

      if (typeof children === 'object' && children !== null) {
        route.children = Object.values(children) as TChildren as TODO
      }

      return route as any
    },

    _addFileTypes: <TFileTypes>() => route,
  }

  return route
}

export type ServerRouteAddFileChildrenFn<
  in out TParentRoute extends AnyServerRouteWithTypes,
  in out TId extends RouteConstraints['TId'],
  in out TPath extends RouteConstraints['TPath'],
  in out TFullPath extends RouteConstraints['TFullPath'],
  in out TMiddlewares,
  in out TMethods,
  in out TChildren,
> = (
  children: TChildren,
) => ServerRouteWithTypes<
  TParentRoute,
  TId,
  TPath,
  TFullPath,
  TMiddlewares,
  TMethods,
  TChildren
>

const createMethodBuilder = <
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
>(
  __opts?: TODO,
): ServerRouteMethodBuilder<TParentRoute, TFullPath, TMiddlewares> => {
  return {
    _options: __opts || {},
    _types: {} as TODO,
    middleware: (middlewares) =>
      createMethodBuilder({
        ...__opts,
        middlewares,
      }) as TODO,
    handler: (handler) =>
      createMethodBuilder({
        ...__opts,
        handler,
      }) as TODO,
  }
}

export type CreateServerFileRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
> = (
  options?: undefined,
) => ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren>

export type AnyServerRouteWithTypes = ServerRouteWithTypes<
  any,
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
  TChildren,
> {
  _types: ServerRouteTypes<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods
  >
  path: TPath
  id: TId
  fullPath: TFullPath
  to: TrimPathRight<TFullPath>
  parentRoute: TParentRoute
  children?: TChildren
  options: ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, TMiddlewares>
  update: (
    opts: ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, undefined>,
  ) => ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren>
  init: (opts: { originalIndex: number }) => void
  _addFileChildren: ServerRouteAddFileChildrenFn<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods,
    TChildren
  >
  _addFileTypes: () => ServerRouteWithTypes<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods,
    TChildren
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

export type AnyServerRoute = AnyServerRouteWithTypes

export interface ServerRoute<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
> extends ServerRouteWithTypes<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      undefined,
      undefined,
      TChildren
    >,
    ServerRouteMiddleware<TParentRoute, TId, TPath, TFullPath, TChildren>,
    ServerRouteMethods<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      undefined,
      TChildren
    > {}

export interface ServerRouteMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
> {
  middleware: <const TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, ReadonlyArray<AnyRequestMiddleware>>,
  ) => ServerRouteAfterMiddleware<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TNewMiddleware,
    TChildren
  >
}

export interface ServerRouteAfterMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TChildren,
> extends ServerRouteWithTypes<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      TMiddlewares,
      undefined,
      TChildren
    >,
    ServerRouteMethods<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      TMiddlewares,
      TChildren
    > {}

export interface ServerRouteMethods<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TChildren,
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
    TMethods,
    TChildren
  >
}

export type ServerRouteMethodsOptions<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> =
  | ServerRouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>
  | ((
      api: ServerRouteMethodBuilder<TParentRoute, TFullPath, TMiddlewares>,
    ) => ServerRouteMethodsRecord<TParentRoute, TFullPath, TMiddlewares>)

export interface ServerRouteMethodsRecord<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> {
  GET?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  POST?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  PUT?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  PATCH?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  DELETE?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  OPTIONS?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
  HEAD?: ServerRouteMethodRecordValue<TParentRoute, TFullPath, TMiddlewares>
}

export type ServerRouteMethodRecordValue<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> =
  | ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TMiddlewares,
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
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares
  >,
) => TResponse | Promise<TResponse>

export interface ServerRouteMethodHandlerCtx<
  in out TParentRoute extends AnyServerRouteWithTypes,
  in out TFullPath extends string,
  in out TMiddlewares,
  in out TMethodMiddlewares,
> {
  context: Expand<
    AssignAllMethodContext<TParentRoute, TMiddlewares, TMethodMiddlewares>
  >
  request: Request
  params: ResolveParams<TFullPath>
  pathname: TFullPath
}

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
> = ResolveAllServerContext<
  TParentRoute,
  MergeMethodMiddlewares<TMiddlewares, TMethodMiddlewares>
>

export type AnyRouteMethodsBuilder = ServerRouteMethodBuilderWithTypes<
  any,
  any,
  any,
  any
>

export interface ServerRouteMethodBuilder<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TFullPath,
      TMiddlewares,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderMiddleware<TParentRoute, TFullPath, TMiddlewares>,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      undefined
    > {}

export interface ServerRouteMethodBuilderWithTypes<
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  _options: TODO
  _types: ServerRouteMethodBuilderTypes<
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface ServerRouteMethodBuilderTypes<
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

export interface ServerRouteMethodBuilderMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<
      TNewMethodMiddlewares,
      ReadonlyArray<AnyRequestMiddleware>
    >,
  ) => ServerRouteMethodBuilderAfterMiddleware<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface ServerRouteMethodBuilderAfterMiddleware<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares
    > {}

export interface ServerRouteMethodBuilderHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  handler: <TResponse>(
    handler: ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      TResponse
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> extends ServerRouteMethodBuilderWithTypes<
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  > {
  opts: ServerRouteMethod<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares
  >
}

export interface ServerRouteMethod<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  middleware?: Constrain<TMiddlewares, Array<AnyRequestMiddleware>>
  handler?: ServerRouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    undefined
  >
}

export interface ServerRouteAfterMethods<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TMethods,
  TChildren,
> extends ServerRouteWithTypes<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TMethods,
    TChildren
  > {
  options: ServerRouteOptions<TParentRoute, TId, TPath, TFullPath, TMiddlewares>
}
