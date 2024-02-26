import { AnyRoute } from './route'
import { Expand, UnionToIntersection, UnionToTuple } from './utils'

export type ParseRoute<TRouteTree, TAcc = TRouteTree> = TRouteTree extends {
  types: { children: infer TChildren }
}
  ? TChildren extends unknown[]
    ? ParseRoute<TChildren[number], TAcc | TChildren[number]>
    : TAcc
  : TAcc

export type RoutesById<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['id']]: K
}

export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  Extract<ParseRoute<TRouteTree>, { id: TId }>,
  AnyRoute
>

export type RouteIds<TRouteTree extends AnyRoute> = ParseRoute<TRouteTree>['id']

export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['fullPath']]: K
}

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  Extract<ParseRoute<TRouteTree>, { fullPath: TPath }>,
  AnyRoute
>
export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
  | '/'

export type RoutePathsAutoComplete<TRouteTree extends AnyRoute, T> =
  | T
  | RoutePaths<TRouteTree>
  | (string & {})

type UnionizeCollisions<T, U> = {
  [P in keyof T & keyof U]: T[P] extends U[P] ? T[P] : T[P] | U[P]
}
type Reducer<T, U, C = UnionizeCollisions<T, U>> = C &
  Omit<T, keyof C> &
  Omit<U, keyof C>

type Reduce<T extends any[], Result = unknown> = T extends [
  infer First,
  ...infer Rest,
]
  ? Reduce<Rest, Reducer<Result, First>>
  : Result

export type FullSearchSchema<TRouteTree extends AnyRoute> = Partial<
  Expand<
    Reduce<UnionToTuple<ParseRoute<TRouteTree>['types']['fullSearchSchema']>>
  >
>

export type AllParams<TRouteTree extends AnyRoute> = Expand<
  UnionToIntersection<ParseRoute<TRouteTree>['types']['allParams']>
>
