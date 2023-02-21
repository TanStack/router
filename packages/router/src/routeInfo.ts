import { AnyRoute, Route } from './route'
import { AnyPathParams, AnySearchSchema, RootRouteId } from './route'
import { IsAny, MergeUnion, Values } from './utils'

export interface AnyRoutesInfo {
  routeTree: AnyRoute
  routeUnion: AnyRoute
  routesById: Record<string, AnyRoute>
  routesByFullPath: Record<string, AnyRoute>
  routeIds: any
  routePaths: any
  routeIntersection: AnyRoute
  fullSearchSchema: Record<string, any>
  allParams: Record<string, any>
}

export interface DefaultRoutesInfo {
  routeTree: AnyRoute
  routeUnion: AnyRoute
  routesById: Record<string, Route>
  routesByFullPath: Record<string, Route>
  routeIds: string
  routePaths: string
  routeIntersection: AnyRoute
  fullSearchSchema: AnySearchSchema
  allParams: AnyPathParams
}

export interface RoutesInfo<TRouteTree extends AnyRoute = Route>
  extends RoutesInfoInner<TRouteTree, ParseRoute<TRouteTree>> {}

export interface RoutesInfoInner<
  TRouteTree extends AnyRoute,
  TRouteUnion extends AnyRoute = Route,
  TRoutesById = { '/': TRouteUnion } & {
    [TRoute in TRouteUnion as TRoute['id']]: TRoute
  },
  TRoutesByFullPath = { '/': TRouteUnion } & {
    [TRoute in TRouteUnion as TRoute['fullPath'] extends RootRouteId
      ? never
      : string extends TRoute['fullPath']
      ? never
      : TRoute['fullPath']]: TRoute
  },
> {
  routeTree: TRouteTree
  routeUnion: TRouteUnion
  routesById: TRoutesById
  routesByFullPath: TRoutesByFullPath
  routeIds: keyof TRoutesById
  routePaths: keyof TRoutesByFullPath
  routeIntersection: Route<
    TRouteUnion['__types']['parentRoute'], // TParentRoute,
    TRouteUnion['__types']['path'], // TPath,
    TRouteUnion['__types']['fullPath'], // TFullPath,
    TRouteUnion['__types']['customId'], // TCustomId,
    TRouteUnion['__types']['id'], // TId,
    TRouteUnion['__types']['loader'], // TId,
    MergeUnion<TRouteUnion['__types']['searchSchema']> & {}, // TSearchSchema,
    MergeUnion<TRouteUnion['__types']['fullSearchSchema']> & {}, // TFullSearchSchema,
    MergeUnion<TRouteUnion['__types']['params']>, // TParams,
    MergeUnion<TRouteUnion['__types']['allParams']>, // TAllParams,
    MergeUnion<TRouteUnion['__types']['parentContext']>, // TParentContext,
    MergeUnion<TRouteUnion['__types']['allParentContext']>, // TAllParentContext,
    MergeUnion<TRouteUnion['__types']['routeContext']> & {}, // TRouteContext,
    MergeUnion<TRouteUnion['__types']['context']> & {}, // TContext,
    MergeUnion<TRouteUnion['__types']['routerContext']> & {}, // TRouterContext,
    TRouteUnion['__types']['children'], // TChildren,
    TRouteUnion['__types']['routesInfo'] // TRoutesInfo,
  >
  fullSearchSchema: Partial<
    MergeUnion<TRouteUnion['__types']['fullSearchSchema']>
  >
  allParams: Partial<MergeUnion<TRouteUnion['__types']['allParams']>>
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
