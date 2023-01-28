import { AnyRootRoute, AnyRoute, RootRoute, Route } from './route'
import { AnyPathParams, AnySearchSchema, RootRouteId } from './route'
import { IsAny, UnionToIntersection, Values } from './utils'

export interface AnyRoutesInfo {
  routeTree: AnyRootRoute
  routesById: Record<string, AnyRoute>
  routesByFullPath: Record<string, AnyRoute>
  routeIds: any
  routePaths: any
  fullSearchSchema: Record<string, any>
  allParams: Record<string, any>
}

export interface DefaultRoutesInfo {
  routeTree: RootRoute
  routesById: Record<string, Route>
  routesByFullPath: Record<string, Route>
  routeIds: string
  routePaths: string
  fullSearchSchema: AnySearchSchema
  allParams: AnyPathParams
}

export interface RoutesInfo<TRouteTree extends AnyRoute = Route>
  extends RoutesInfoInner<TRouteTree, ParseRoute<TRouteTree>> {}

export interface RoutesInfoInner<
  TRouteTree extends AnyRoute,
  TRoutes extends AnyRoute = Route,
  TRoutesById = { '/': TRoutes } & {
    [TRoute in TRoutes as TRoute['id']]: TRoute
  },
  TRoutesByFullPath = { '/': TRoutes } & {
    [TRoute in TRoutes as TRoute['fullPath'] extends RootRouteId
      ? never
      : string extends TRoute['fullPath']
      ? never
      : TRoute['fullPath']]: TRoute
  },
> {
  routeTree: TRouteTree
  routes: TRoutes
  routesById: TRoutesById
  routesByFullPath: TRoutesByFullPath
  routeIds: keyof TRoutesById
  routePaths: keyof TRoutesByFullPath
  fullSearchSchema: Partial<
    UnionToIntersection<TRoutes['__types']['fullSearchSchema']>
  >
  allParams: Partial<UnionToIntersection<TRoutes['__types']['allParams']>>
}

export type ParseRoute<TRouteTree> = TRouteTree extends AnyRoute
  ? TRouteTree | ParseRouteChildren<TRouteTree>
  : never

export type ParseRouteChildren<TRouteTree> = TRouteTree extends Route<
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
    ? Values<{
        [TId in TChildren[number]['id']]: ParseRouteChild<
          TChildren[number],
          TId
        >
      }>
    : never
  : never

export type ParseRouteChild<TRoute, TId> = TRoute extends AnyRoute
  ? ParseRoute<TRoute>
  : never

export type RoutesById<TRoutesInfo extends AnyRoutesInfo> = {
  [K in keyof TRoutesInfo['routesById']]: TRoutesInfo['routesById'][K]
}

export type RouteById<
  TRoutesInfo extends AnyRoutesInfo,
  TId,
> = TId extends keyof TRoutesInfo['routesById']
  ? IsAny<
      TRoutesInfo['routesById'][TId]['id'],
      Route,
      TRoutesInfo['routesById'][TId]
    >
  : never

export type RouteByPath<
  TRoutesInfo extends AnyRoutesInfo,
  TPath,
> = TPath extends keyof TRoutesInfo['routesByFullPath']
  ? IsAny<
      TRoutesInfo['routesByFullPath'][TPath]['id'],
      Route,
      TRoutesInfo['routesByFullPath'][TPath]
    >
  : never
