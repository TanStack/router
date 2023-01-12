import { RouteConfig, RouteOptions } from './routeConfig'
import {
  AnyAllRouteInfo,
  AnyRouteInfo,
  DefaultAllRouteInfo,
  RouteInfo,
} from './routeInfo'
import { Router } from './router'

export interface AnyRoute extends Route<any, any, any> {}

export interface Route<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
  TRouterContext = unknown,
> {
  routeInfo: TRouteInfo
  routeId: TRouteInfo['id']
  routeRouteId: TRouteInfo['routeId']
  routePath: TRouteInfo['path']
  fullPath: TRouteInfo['fullPath']
  getParentRoute: () => undefined | AnyRoute
  childRoutes?: AnyRoute[]
  options: RouteOptions
  originalIndex: number
  getRouter: () => Router<
    TAllRouteInfo['routeConfig'],
    TAllRouteInfo,
    TRouterContext
  >
}

export function createRoute<
  TAllRouteInfo extends AnyAllRouteInfo = DefaultAllRouteInfo,
  TRouteInfo extends AnyRouteInfo = RouteInfo,
  TRouterContext = unknown,
>(
  routeConfig: RouteConfig,
  options: TRouteInfo['options'],
  originalIndex: number,
  parent: undefined | Route<TAllRouteInfo, any>,
  router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo, TRouterContext>,
): Route<TAllRouteInfo, TRouteInfo, TRouterContext> {
  const { id, routeId, path: routePath, fullPath } = routeConfig

  let route: Route<TAllRouteInfo, TRouteInfo, TRouterContext> = {
    routeInfo: undefined!,
    routeId: id,
    routeRouteId: routeId,
    originalIndex,
    routePath,
    fullPath,
    options,
    getRouter: () => router,
    childRoutes: undefined!,
    getParentRoute: () => parent,
  }

  router.options.createRoute?.({ router, route })

  return route
}
