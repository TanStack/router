import type { AddTrailingSlash, RemoveTrailingSlashes } from './link'
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

export type ParseRouteLeaves<TRouteTree> =
  ParseRoute<TRouteTree> extends infer TRoute extends AnyRoute
    ? TRoute extends any
      ? TRoute['types']['children'] extends ReadonlyArray<any>
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

export type CatchAllPaths<TRouteTree extends AnyRoute> = Record<
  '.' | '..',
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

export type RouteLeafPathByTrailingSlashOption<TFullPath extends string> = {
  always: AddTrailingSlash<TFullPath>
  preserve: RemoveTrailingSlashes<TFullPath> | AddTrailingSlash<TFullPath>
  never: RemoveTrailingSlashes<TFullPath>
}

export type TrailingSlashOptionByRouter<TRouter extends AnyRouter> =
  TrailingSlashOption extends TRouter['options']['trailingSlash']
    ? 'never'
    : NonNullable<TRouter['options']['trailingSlash']>

export type RouteLeafPath<
  TRouter extends AnyRouter,
  TFullPath extends string,
> = RouteLeafPathByTrailingSlashOption<TFullPath>[TrailingSlashOptionByRouter<TRouter>]

export type RouteLeafPaths<
  TRouter extends AnyRouter,
  TRouteTree extends AnyRoute,
> = RouteLeafPath<TRouter, ParseRouteLeaves<TRouteTree>['fullPath']>

export type RouteLeavesByPath<TRouter extends AnyRouter> = {
  [TRoute in ParseRouteLeaves<TRouter['routeTree']> as RouteLeafPath<
    TRouter,
    TRoute['fullPath']
  >]: TRoute
} & CatchAllPaths<TRouter['routeTree']>

export type RouteLeafByPath<TRouter extends AnyRouter, TPath> = Extract<
  string extends TPath
    ? ParseRouteLeaves<TRouter['routeTree']>
    : RouteLeavesByPath<TRouter>[TPath],
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
