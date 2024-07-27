import type { AnyRoute } from './route'
import type { AnyRouter, TrailingSlashOption } from './router'
import type { MergeUnion } from './utils'

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

export type RoutesById<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['id']]: K
}

export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  RoutesById<TRouteTree>[TId],
  AnyRoute
>

export type RouteIds<TRouteTree extends AnyRoute> = ParseRoute<TRouteTree>['id']

export type CatchAllPaths = '.' | '..' | ''

export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['fullPath']]: K
}

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  RoutesByPath<TRouteTree>[TPath],
  AnyRoute
>

export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
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
      : TRoute['fullPath'] extends `${infer TRest}/`
        ? TRest
        : TRoute['fullPath']
    : TRoute['fullPath']

export type RouteToPathPreserveTrailingSlash<TRoute extends AnyRoute> =
  | RouteToPathNeverTrailingSlash<TRoute>
  | RouteToPathAlwaysTrailingSlash<TRoute>

export type RouteToPathByTrailingSlashOption<TRoute extends AnyRoute> = {
  always: RouteToPathAlwaysTrailingSlash<TRoute>
  preserve: RouteToPathPreserveTrailingSlash<TRoute>
  never: RouteToPathNeverTrailingSlash<TRoute>
}

export type TrailingSlashOptionByRouter<TRouter extends AnyRouter> =
  TrailingSlashOption extends TRouter['options']['trailingSlash']
    ? 'never'
    : NonNullable<TRouter['options']['trailingSlash']>

export type RouteToByRouter<
  TRouter extends AnyRouter,
  TRoute extends AnyRoute,
> = RouteToPathByTrailingSlashOption<TRoute>[TrailingSlashOptionByRouter<TRouter>]

export type RouteToPath<
  TRouter extends AnyRouter,
  TRouteTree extends AnyRoute,
> =
  ParseRouteWithoutBranches<TRouteTree> extends infer TRoute extends AnyRoute
    ? TRoute extends any
      ? RouteToByRouter<TRouter, TRoute>
      : never
    : never

export type RoutesByToPath<TRouter extends AnyRouter> = {
  [TRoute in ParseRouteWithoutBranches<TRouter['routeTree']> as RouteToByRouter<
    TRouter,
    TRoute
  >]: TRoute
}

export type RouteByToPath<TRouter extends AnyRouter, TTo> = Extract<
  RoutesByToPath<TRouter>[TTo],
  AnyRoute
>

export type FullSearchSchema<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['types']['fullSearchSchema']
>

export type FullSearchSchemaInput<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['types']['fullSearchSchemaInput']
>

export type AllParams<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['types']['allParams']
>

export type AllContext<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['types']['allContext']
>

export type AllLoaderData<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['types']['loaderData']
>
