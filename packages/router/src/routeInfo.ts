import { Route } from './route'
import {
  AnyLoaderData,
  AnyPathParams,
  AnyRouteConfig,
  AnyRouteConfigWithChildren,
  AnySearchSchema,
  RootRouteId,
  RouteConfig,
  RouteOptions,
} from './routeConfig'
import { IsAny, UnionToIntersection, Values } from './utils'

export interface AnyAllRouteInfo {
  routeConfig: AnyRouteConfig
  routeInfo: AnyRouteInfo
  routeInfoById: Record<string, AnyRouteInfo>
  routeInfoByFullPath: Record<string, AnyRouteInfo>
  routeIds: any
  routePaths: any
  fullSearchSchema: Record<string, any>
  allParams: Record<string, any>
}

export interface DefaultAllRouteInfo {
  routeConfig: RouteConfig
  routeInfo: RouteInfo
  routeInfoById: Record<string, RouteInfo>
  routeInfoByFullPath: Record<string, RouteInfo>
  routeIds: string
  routePaths: string
  fullSearchSchema: AnySearchSchema
  allParams: AnyPathParams
}

export interface AllRouteInfo<TRouteConfig extends AnyRouteConfig = RouteConfig>
  extends RoutesInfoInner<TRouteConfig, ParseRouteConfig<TRouteConfig>> {}

export type ParseRouteConfig<TRouteConfig = AnyRouteConfig> =
  TRouteConfig extends AnyRouteConfig
    ? RouteConfigRoute<TRouteConfig> | ParseRouteChildren<TRouteConfig>
    : never

type ParseRouteChildren<TRouteConfig> =
  TRouteConfig extends AnyRouteConfigWithChildren<infer TChildren>
    ? unknown extends TChildren
      ? never
      : TChildren extends AnyRouteConfig[]
      ? Values<{
          [TId in TChildren[number]['id']]: ParseRouteChild<
            TChildren[number],
            TId
          >
        }>
      : never // Children are not routes
    : never // No children

type ParseRouteChild<TRouteConfig, TId> = TRouteConfig & {
  id: TId
} extends AnyRouteConfig
  ? ParseRouteConfig<TRouteConfig>
  : never

// Generics!
export type RouteConfigRoute<TRouteConfig> = TRouteConfig extends RouteConfig<
  infer TId,
  infer TCustomId,
  infer TPath,
  infer TFullPath,
  infer TParentSearchSchema,
  infer TSearchSchema,
  infer TFullSearchSchema,
  infer TParentParams,
  infer TParams,
  infer TAllParams,
  any
>
  ? string extends TCustomId
    ? never
    : RouteInfo<
        TId,
        TCustomId,
        TPath,
        TFullPath,
        TParentSearchSchema,
        TSearchSchema,
        TFullSearchSchema,
        TParentParams,
        TParams,
        TAllParams
      >
  : never

export interface RoutesInfoInner<
  TRouteConfig extends AnyRouteConfig,
  TRouteInfo extends RouteInfo<
    string,
    string,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  > = RouteInfo,
  TRouteInfoById = { '/': TRouteInfo } & {
    [TInfo in TRouteInfo as TInfo['id']]: TInfo
  },
  TRouteInfoByFullPath = { '/': TRouteInfo } & {
    [TInfo in TRouteInfo as TInfo['fullPath'] extends RootRouteId
      ? never
      : string extends TInfo['fullPath']
      ? never
      : TInfo['fullPath']]: TInfo
  },
> {
  routeConfig: TRouteConfig
  routeInfo: TRouteInfo
  routeInfoById: TRouteInfoById
  routeInfoByFullPath: TRouteInfoByFullPath
  routeIds: keyof TRouteInfoById
  routePaths: keyof TRouteInfoByFullPath
  fullSearchSchema: Partial<UnionToIntersection<TRouteInfo['fullSearchSchema']>>
  allParams: Partial<UnionToIntersection<TRouteInfo['allParams']>>
}

export interface AnyRouteInfo
  extends RouteInfo<any, any, any, any, any, any, any, any, any, any> {}

export interface RouteInfo<
  TId extends string = string,
  TCustomId extends string = string,
  TPath extends string = string,
  TFullPath extends string = '/',
  TParentSearchSchema extends {} = {},
  TSearchSchema extends AnySearchSchema = {},
  TFullSearchSchema extends AnySearchSchema = {},
  TParentParams extends AnyPathParams = {},
  TParams extends AnyPathParams = {},
  TAllParams extends AnyPathParams = {},
> {
  id: TId
  customId: TCustomId
  path: TPath
  fullPath: TFullPath
  searchSchema: TSearchSchema
  fullSearchSchema: TFullSearchSchema
  parentParams: TParentParams
  params: TParams
  allParams: TAllParams
  options: RouteOptions<
    TCustomId,
    TPath,
    TParentSearchSchema,
    TSearchSchema,
    TFullSearchSchema,
    TParentParams,
    TParams,
    TAllParams
  >
}

export type RoutesById<TAllRouteInfo extends AnyAllRouteInfo> = {
  [K in keyof TAllRouteInfo['routeInfoById']]: Route<
    TAllRouteInfo,
    TAllRouteInfo['routeInfoById'][K]
  >
}

export type RouteInfoById<
  TAllRouteInfo extends AnyAllRouteInfo,
  TId,
> = TId extends keyof TAllRouteInfo['routeInfoById']
  ? IsAny<
      TAllRouteInfo['routeInfoById'][TId]['id'],
      RouteInfo,
      TAllRouteInfo['routeInfoById'][TId]
    >
  : never

export type RouteInfoByPath<
  TAllRouteInfo extends AnyAllRouteInfo,
  TPath,
> = TPath extends keyof TAllRouteInfo['routeInfoByFullPath']
  ? IsAny<
      TAllRouteInfo['routeInfoByFullPath'][TPath]['id'],
      RouteInfo,
      TAllRouteInfo['routeInfoByFullPath'][TPath]
    >
  : never
