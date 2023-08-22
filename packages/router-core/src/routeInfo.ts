import { AnyRoute, Route } from './route'
import { MergeUnion } from './utils'

export type ParseRoute<TRouteTree extends AnyRoute> =
  | TRouteTree
  | ParseRouteChildren<TRouteTree>

export type ParseRouteChildren<TRouteTree extends AnyRoute> =
  TRouteTree extends Route<
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
    any,
    any,
    infer TChildren,
    any
  >
    ? unknown extends TChildren
      ? never
      : TChildren extends AnyRoute[]
      ? {
          [TId in TChildren[number]['id'] as string]: ParseRoute<
            TChildren[number]
          >
        }[string]
      : never
    : never

export type RoutesById<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree>['id'] as K['id']]: K
}

export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  ParseRoute<TRouteTree>,
  { id: TId }
>

export type RouteIds<TRouteTree extends AnyRoute> = AnyRoute extends TRouteTree
  ? string
  : ParseRoute<TRouteTree>['id']

export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree>['fullPath'] as K['fullPath']]: K
}

export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  ParseRoute<TRouteTree>,
  { fullPath: TPath }
>

export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
  | '/'

export type FullSearchSchema<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['__types']['fullSearchSchema']
> & {}

export type AllParams<TRouteTree extends AnyRoute> = MergeUnion<
  ParseRoute<TRouteTree>['__types']['allParams']
>
