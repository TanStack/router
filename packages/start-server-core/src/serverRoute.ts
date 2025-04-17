import { joinPaths, rootRouteId, trimPathLeft } from '@tanstack/router-core'
import type {
  AnyRouter,
  Assign,
  Constrain,
  Expand,
  InferFileRouteTypes,
  LooseAsyncReturnType,
  LooseReturnType,
  ResolveParams,
  RouteConstraints,
  TrimPathRight,
} from '@tanstack/router-core'
import type {
  AnyMiddleware,
  AssignAllServerContext,
  JsonResponse,
  Middleware,
} from '@tanstack/start-client-core'

type TODO = any

export function createServerFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TChildren,
>(
  __?: never,
  __compiledOpts?: { manifest: ServerRouteManifest },
): ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren> {
  return createServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren>(
    undefined,
    __compiledOpts as ServerRouteOptions<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      undefined,
      TChildren
    >,
  )
}

export interface ServerRouteOptions<
  TParentRoute extends AnyServerRouteWithTypes,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
  TMiddlewares,
  TChildren,
> {
  id: TId
  path: TPath
  pathname: TFullPath
  originalIndex: number
  getParentRoute?: () => TParentRoute
  middleware: Constrain<TMiddlewares, ReadonlyArray<AnyMiddleware>>
  methods: ServerRouteMethods<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    ReadonlyArray<AnyMiddleware>,
    TChildren
  >
  manifest?: ServerRouteManifest
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
  __opts?: ServerRouteOptions<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    undefined,
    TChildren
  >,
): ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren> {
  const options = (__opts || {}) as ServerRouteOptions<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    undefined,
    TChildren
  >

  const route = {
    path: '' as TPath,
    id: '' as TId,
    fullPath: '' as TFullPath,
    to: '' as TrimPathRight<TFullPath>,
    options,
    parentRoute: undefined as unknown as TParentRoute,
    _types: {} as TODO,
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
      } as TODO) as TODO
    },
    client: new Proxy(
      {},
      {
        get(target, propKey) {
          return (...args: Array<any>) => {
            if (typeof propKey === 'string') {
              const upperPropKey = propKey.toUpperCase()
              const method = options.manifest?.methods[
                upperPropKey as keyof typeof options.methods
              ] as ((...args: Array<any>) => any) | undefined
              if (method) {
                return fetch(
                  new URL(`${options.pathname}/${propKey}`, args[0].url),
                  {
                    method: upperPropKey,
                    ...args[0],
                  },
                )
              }
            }
            throw new Error(`Method ${String(propKey)} not found`)
          }
        },
      },
    ),
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

      return route
    },

    _addFileTypes: () => route,
  } as ServerRoute<TParentRoute, TId, TPath, TFullPath, TChildren>

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
> = <const TNewChildren>(
  children: TNewChildren,
) => ServerRouteWithTypes<
  TParentRoute,
  TId,
  TPath,
  TFullPath,
  TMiddlewares,
  TMethods,
  TNewChildren
>

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
  update: (
    opts: ServerRouteOptions<
      TParentRoute,
      TId,
      TPath,
      TFullPath,
      undefined,
      TChildren
    >,
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
  _addFileTypes: <T = TODO>() => ServerRouteWithTypes<
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
      undefined
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
    middleware: Constrain<TNewMiddleware, ReadonlyArray<AnyMiddleware>>,
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
  TResponse,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares
  >,
) => TResponse | Promise<TResponse>

export interface ServerRouteMethodHandlerCtx<
  in out TParentRoute extends AnyServerRouteWithTypes,
  in out TFullPath extends string,
  in out TVerb extends ServerRouteVerb,
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
  any,
  any
>

export interface ServerRouteMethodBuilder<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> extends ServerRouteMethodBuilderWithTypes<
      TParentRoute,
      TFullPath,
      TMiddlewares,
      undefined,
      undefined
    >,
    ServerRouteMethodBuilderMiddleware<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      undefined
    > {}

export interface ServerRouteMethodBuilderWithTypes<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> {
  _options: TODO
  _types: ServerRouteMethodBuilderTypes<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface ServerRouteMethodBuilderTypes<
  in out TParentRoute extends AnyServerRouteWithTypes,
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
      TParentRoute,
      TFullPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
    >,
    ServerRouteMethodBuilderHandler<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    > {}

export interface ServerRouteMethodBuilderHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> {
  handler: <TResponse>(
    handler: ServerRouteMethodHandlerFn<
      TParentRoute,
      TFullPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TResponse
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TResponse,
> extends ServerRouteMethodBuilderWithTypes<
    TParentRoute,
    TFullPath,
    TMiddlewares,
    TMethodMiddlewares,
    TResponse
  > {
  opts: ServerRouteMethod<
    TParentRoute,
    TFullPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares
  >
}

export interface ServerRouteMethod<
  TParentRoute extends AnyServerRouteWithTypes,
  TFullPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> {
  middleware?: Constrain<TMiddlewares, Middleware<any>>
  handler?: ServerRouteMethodHandlerFn<
    TParentRoute,
    TFullPath,
    TVerb,
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
  options: ServerRouteOptions<
    TParentRoute,
    TId,
    TPath,
    TFullPath,
    TMiddlewares,
    TChildren
  >
}

export type ResolveMethods<TMethods> = TMethods extends (
  ...args: Array<any>
) => infer TMethods
  ? TMethods
  : TMethods

export type ServerRouteMethodClientResult<TMethod> =
  ServerRouteMethodClientResponseJson<TMethod> extends Promise<any>
    ? ServerRouteMethodClientResponseJson<TMethod>
    : Promise<ServerRouteMethodClientResponseJson<TMethod>>

export type ServerRouteMethodClientResponseJson<TMethod> =
  ServerRouteMethodClientResponse<TMethod> extends JsonResponse<any>
    ? LooseReturnType<ServerRouteMethodClientResponse<TMethod>['json']>
    : ServerRouteMethodClientResponse<TMethod>

export type ServerRouteMethodClientResponse<TMethod> =
  TMethod extends AnyRouteMethodsBuilder
    ? Awaited<TMethod['_types']['response']>
    : LooseAsyncReturnType<TMethod>

export type ServerRouteMethodClientInputBuilder<
  TFullPath extends string,
  TInput,
> = TInput extends any
  ? ServerRouteMethodClientParamsInput<TFullPath, TInput> &
      ServerRouteMethodClientSearchInput<TInput> &
      ServerRouteMethodClientBodyInput<TInput> &
      ServerRouteMethodClientHeadersInput<TInput>
  : never

export type ServerRouteMethodClientParamsInput<
  TFullPath extends string,
  TInput,
> = TInput extends { params: infer TParams }
  ? RequiredOrOptionalRecord<'params', TParams>
  : DefaultServerRouteMethodClientParamsInput<TFullPath>

export type RequiredOrOptionalRecord<
  TKey extends string,
  TValue,
> = {} extends TValue ? { [K in TKey]?: TValue } : { [K in TKey]: TValue }

export type DefaultServerRouteMethodClientParamsInput<
  TFullPath extends string,
> = RequiredOrOptionalRecord<'params', ResolveParams<TFullPath>>

export type ServerRouteMethodClientSearchInput<TInput> = TInput extends {
  search: infer TSearch
}
  ? RequiredOrOptionalRecord<'search', Expand<TSearch>>
  : DefaultServerRouteMethodClientSearchInput

export interface DefaultServerRouteMethodClientSearchInput {
  search?: Record<string, unknown>
}

export type ServerRouteMethodClientBodyInput<TInput> = TInput extends {
  body: infer TBody
}
  ? RequiredOrOptionalRecord<'body', Expand<TBody>>
  : DefaultServerRouteMethodClientBodyInput

export interface DefaultServerRouteMethodClientBodyInput {
  body?: unknown
}

export type ServerRouteMethodClientHeadersInput<TInput> = TInput extends {
  headers: infer THeaders
}
  ? RequiredOrOptionalRecord<'headers', Expand<THeaders>>
  : DefaultServerRouteMethodClientHeadersInput

export interface DefaultServerRouteMethodClientHeadersInput {
  headers?: Record<string, unknown>
}

export type ServerRoutesById<TRouter extends AnyRouter> = InferFileRouteTypes<
  TRouter['routeTree']
>['serverFileRoutesById']

export type ServerRouteById<
  TRouter extends AnyRouter,
  TId extends keyof ServerRoutesById<TRouter>,
> = ServerRoutesById<TRouter>[TId]
