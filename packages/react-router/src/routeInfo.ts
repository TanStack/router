import type { AnyRoute } from './route'
import type { AnyRouter, Router, TrailingSlashOption } from './router'
import type { UnionToIntersection, UnionToTuple } from './utils'

export type ParseRoute<TRouteTree, TAcc = TRouteTree> = TRouteTree extends {
  types: { children: infer TChildren }
}
  ? TChildren extends ReadonlyArray<any>
    ? ParseRoute<TChildren[number], TAcc | TChildren[number]>
    : TAcc
  : TAcc

export type ParseRouteWithoutBranches<TRouteTree> =
  ParseRoute<TRouteTree> extends infer TRoute extends AnyRoute
    ? TRoute extends any
      ? TRoute['types']['children'] extends ReadonlyArray<any>
        ? '/' extends TRoute['types']['children'][number]['path']
          ? never
          : TRoute
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

export type CatchAllPaths<TRouteTree extends AnyRoute> = Record<
  '.' | '..' | '',
  ParseRoute<TRouteTree>
>

export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['fullPath']]: K
} & CatchAllPaths<TRouteTree>

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  string extends TPath
    ? ParseRoute<TRouteTree>
    : RoutesByPath<TRouteTree>[TPath],
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
} & CatchAllPaths<TRouter['routeTree']>

export type RouteByToPath<TRouter extends AnyRouter, TTo> = Extract<
  string extends TTo
    ? ParseRouteWithoutBranches<TRouter['routeTree']>
    : RoutesByToPath<TRouter>[TTo],
  AnyRoute
>

export type RoutePathsAutoComplete<TRouteTree extends AnyRoute, T> =
  | (string extends T ? T & {} : T)
  | RoutePaths<TRouteTree>

// eslint-disable-next-line @typescript-eslint/naming-convention
type UnionizeCollisions<T, U> = {
  [P in keyof T & keyof U]: T[P] extends U[P] ? T[P] : T[P] | U[P]
}
// eslint-disable-next-line @typescript-eslint/naming-convention
type Reducer<T, U, C = UnionizeCollisions<T, U>> = C &
  Omit<T, keyof C> &
  Omit<U, keyof C>

type Reduce<TValue extends Array<any>, TResult = unknown> = TValue extends [
  infer First,
  ...infer Rest,
]
  ? Reduce<Rest, Reducer<TResult, First>>
  : TResult

export type FullSearchSchema<TRouteTree extends AnyRoute> = Partial<
  Reduce<UnionToTuple<ParseRoute<TRouteTree>['types']['fullSearchSchema']>>
>

export type AllParams<TRouteTree extends AnyRoute> = UnionToIntersection<
  ParseRoute<TRouteTree>['types']['allParams']
>
