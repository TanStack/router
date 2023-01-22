import { RouteConfig, RouteOptions } from './routeConfig'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { Router } from './router'

export interface AnyRoute extends Route<any, any, any> {}

export class Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
  TRouterContext = unknown,
> {
  routeInfo!: TRouteInfo
  id!: TRouteInfo['id']
  customId!: TRouteInfo['customId']
  path!: TRouteInfo['path']
  fullPath!: TRouteInfo['fullPath']
  getParentRoute!: () => undefined | AnyRoute
  childRoutes?: AnyRoute[]
  options!: RouteOptions
  originalIndex!: number
  getRouter!: () => Router<
    TAllRouteInfo['routeConfig'],
    TAllRouteInfo,
    TRouterContext
  >
  constructor(
    routeConfig: RouteConfig,
    options: TRouteInfo['options'],
    originalIndex: number,
    parent: undefined | Route<TAllRouteInfo, any>,
    router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo, TRouterContext>,
  ) {
    Object.assign(this, {
      ...routeConfig,
      originalIndex,
      options,
      getRouter: () => router,
      childRoutes: undefined!,
      getParentRoute: () => parent,
    })

    router.options.createRoute?.({ router, route: this })
  }
}
