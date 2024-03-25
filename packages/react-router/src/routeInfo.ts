import type { AnyRoute } from './route'
import type { Expand, UnionToIntersection, UnionToTuple } from './utils'

export type ParseRoute<TRouteTree, TAcc = TRouteTree> = TRouteTree extends {
  types: { children: infer TChildren }
}
  ? TChildren extends Array<unknown>
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
} & Record<'.' | '..', ParseRoute<TRouteTree>>

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  string extends TPath
    ? ParseRoute<TRouteTree>
    : RoutesByPath<TRouteTree>[TPath],
  AnyRoute
>

export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
  | '/'

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
  Expand<
    Reduce<UnionToTuple<ParseRoute<TRouteTree>['types']['fullSearchSchema']>>
  >
>

export type AllParams<TRouteTree extends AnyRoute> = Expand<
  UnionToIntersection<ParseRoute<TRouteTree>['types']['allParams']>
>
