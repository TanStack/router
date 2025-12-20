import type { InferFileRouteTypes } from './fileRoute'
import type { AddTrailingSlash, RemoveTrailingSlashes } from './link'
import type { AnyRoute } from './route'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  TrailingSlashOption,
} from './router'
import type { PartialMergeAll } from './utils'

export type ParseRoute<TRouteTree, TAcc = TRouteTree> = TRouteTree extends {
  types: { children: infer TChildren }
}
  ? unknown extends TChildren
    ? TAcc
    : TChildren extends ReadonlyArray<any>
      ? ParseRoute<TChildren[number], TAcc | TChildren[number]>
      : ParseRoute<
          TChildren[keyof TChildren],
          TAcc | TChildren[keyof TChildren]
        >
  : TAcc

export type ParseRouteWithoutBranches<TRouteTree> =
  ParseRoute<TRouteTree> extends infer TRoute extends AnyRoute
    ? TRoute extends any
      ? unknown extends TRoute['types']['children']
        ? TRoute
        : TRoute['types']['children'] extends ReadonlyArray<any>
          ? '/' extends TRoute['types']['children'][number]['path']
            ? never
            : TRoute
          : '/' extends TRoute['types']['children'][keyof TRoute['types']['children']]['path']
            ? never
            : TRoute
      : never
    : never

export type CodeRoutesById<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? {
        [K in TRoutes as K['id']]: K
      }
    : never

export type RoutesById<TRouteTree extends AnyRoute> =
  InferFileRouteTypes<TRouteTree> extends never
    ? CodeRoutesById<TRouteTree>
    : InferFileRouteTypes<TRouteTree>['fileRoutesById']

export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  RoutesById<TRouteTree>[TId & keyof RoutesById<TRouteTree>],
  AnyRoute
>

export type CodeRouteIds<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? TRoutes['id']
    : never

export type RouteIds<TRouteTree extends AnyRoute> =
  InferFileRouteTypes<TRouteTree> extends never
    ? CodeRouteIds<TRouteTree>
    : InferFileRouteTypes<TRouteTree>['id']

export type ParentPath<TRegister extends Register> =
  TrailingSlashOptionByRouter<TRegister> extends 'always'
    ? '../'
    : TrailingSlashOptionByRouter<TRegister> extends 'never'
      ? '..'
      : '../' | '..'

export type CurrentPath<TRegister extends Register> =
  TrailingSlashOptionByRouter<TRegister> extends 'always'
    ? './'
    : TrailingSlashOptionByRouter<TRegister> extends 'never'
      ? '.'
      : './' | '.'

export type ToPath<TRegister extends Register, TTo extends string> =
  TrailingSlashOptionByRouter<TRegister> extends 'always'
    ? AddTrailingSlash<TTo>
    : TrailingSlashOptionByRouter<TRegister> extends 'never'
      ? RemoveTrailingSlashes<TTo>
      : AddTrailingSlash<TTo> | RemoveTrailingSlashes<TTo>

export type CatchAllPaths<TRegister extends Register> =
  | CurrentPath<TRegister>
  | ParentPath<TRegister>

export type CodeRoutesByPath<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? {
        [K in TRoutes as K['fullPath']]: K
      }
    : never

export type RoutesByPath<TRouteTree extends AnyRoute> =
  InferFileRouteTypes<TRouteTree> extends never
    ? CodeRoutesByPath<TRouteTree>
    : InferFileRouteTypes<TRouteTree>['fileRoutesByFullPath']

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  RoutesByPath<TRouteTree>[TPath & keyof RoutesByPath<TRouteTree>],
  AnyRoute
>

export type CodeRoutePaths<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? TRoutes['fullPath']
    : never

export type RoutePaths<TRouteTree extends AnyRoute> = unknown extends TRouteTree
  ? string
  :
      | (InferFileRouteTypes<TRouteTree> extends never
          ? CodeRoutePaths<TRouteTree>
          : InferFileRouteTypes<TRouteTree>['fullPaths'])
      | '/'

export type RouteToPathAlwaysTrailingSlash<TRoute extends AnyRoute> =
  TRoute['path'] extends '/'
    ? TRoute['fullPath']
    : TRoute['fullPath'] extends '/'
      ? TRoute['fullPath']
      : `${TRoute['fullPath']}/`

export type RouteToPathNeverTrailingSlash<TRoute extends AnyRoute> =
  TRoute['path'] extends '/'
    ? TRoute['fullPath'] extends '/'
      ? TRoute['fullPath']
      : RemoveTrailingSlashes<TRoute['fullPath']>
    : TRoute['fullPath']

export type RouteToPathPreserveTrailingSlash<TRoute extends AnyRoute> =
  | RouteToPathNeverTrailingSlash<TRoute>
  | RouteToPathAlwaysTrailingSlash<TRoute>

export type RouteToPathByTrailingSlashOption<TRoute extends AnyRoute> = {
  always: RouteToPathAlwaysTrailingSlash<TRoute>
  preserve: RouteToPathPreserveTrailingSlash<TRoute>
  never: RouteToPathNeverTrailingSlash<TRoute>
}

export type TrailingSlashOptionByRouter<TRegister extends Register> =
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? TrailingSlashOption extends TRouter['options']['trailingSlash']
      ? 'never'
      : NonNullable<TRouter['options']['trailingSlash']>
    : never

export type RouteToByRouter<
  TRegister extends Register,
  TRoute extends AnyRoute,
> = RouteToPathByTrailingSlashOption<TRoute>[TrailingSlashOptionByRouter<TRegister>]

export type CodeRouteToPath<TRegister extends Register> =
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? ParseRouteWithoutBranches<
        TRouter['routeTree']
      > extends infer TRoute extends AnyRoute
      ? TRoute extends any
        ? RouteToByRouter<TRegister, TRoute>
        : never
      : never
    : never

export type FileRouteToPath<
  TRegister extends Register,
  TTo = RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? InferFileRouteTypes<TRouter['routeTree']>['to']
    : never,
  TTrailingSlashOption = TrailingSlashOptionByRouter<TRegister>,
> = 'never' extends TTrailingSlashOption
  ? TTo
  : 'always' extends TTrailingSlashOption
    ? AddTrailingSlash<TTo>
    : TTo | AddTrailingSlash<TTo>

export type RouteToPath<TRegister extends Register> = unknown extends TRegister
  ? string
  : RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? InferFileRouteTypes<TRouter['routeTree']> extends never
      ? CodeRouteToPath<TRegister>
      : FileRouteToPath<TRegister>
    : never

export type CodeRoutesByToPath<TRegister extends Register> =
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? ParseRouteWithoutBranches<
        TRouter['routeTree']
      > extends infer TRoutes extends AnyRoute
      ? {
          [TRoute in TRoutes as RouteToByRouter<TRegister, TRoute>]: TRoute
        }
      : never
    : never

export type RoutesByToPath<TRegister extends Register> =
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? InferFileRouteTypes<TRouter['routeTree']> extends never
      ? CodeRoutesByToPath<TRegister>
      : InferFileRouteTypes<TRouter['routeTree']>['fileRoutesByTo']
    : never

export type CodeRouteByToPath<TRegister extends Register, TTo> = Extract<
  RoutesByToPath<TRegister>[TTo & keyof RoutesByToPath<TRegister>],
  AnyRoute
>

export type FileRouteByToPath<TRegister extends Register, TTo> =
  'never' extends TrailingSlashOptionByRouter<TRegister>
    ? CodeRouteByToPath<TRegister, TTo>
    : 'always' extends TrailingSlashOptionByRouter<TRegister>
      ? TTo extends '/'
        ? CodeRouteByToPath<TRegister, TTo>
        : TTo extends `${infer TPath}/`
          ? CodeRouteByToPath<TRegister, TPath>
          : never
      : CodeRouteByToPath<
          TRegister,
          TTo extends '/' ? TTo : RemoveTrailingSlashes<TTo>
        >

export type RouteByToPath<TRegister extends Register, TTo> =
  RegisteredRouter<TRegister> extends infer TRouter extends AnyRouter
    ? InferFileRouteTypes<TRouter['routeTree']> extends never
      ? CodeRouteByToPath<TRegister, TTo>
      : FileRouteByToPath<TRegister, TTo>
    : never

export type FullSearchSchema<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? PartialMergeAll<TRoutes['types']['fullSearchSchema']>
    : never

export type FullSearchSchemaInput<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? PartialMergeAll<TRoutes['types']['fullSearchSchemaInput']>
    : never

export type AllParams<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? PartialMergeAll<TRoutes['types']['allParams']>
    : never

export type AllContext<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? PartialMergeAll<TRoutes['types']['allContext']>
    : never

export type AllLoaderData<TRouteTree extends AnyRoute> =
  ParseRoute<TRouteTree> extends infer TRoutes extends AnyRoute
    ? PartialMergeAll<TRoutes['types']['loaderData']>
    : never
