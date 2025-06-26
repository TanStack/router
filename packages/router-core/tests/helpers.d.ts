import type { AnyRoute } from '../src/route'
import type { AnyRouter, RouterOptions } from '../src/router'

export declare function createRouteFn(options: any): AnyRoute

export declare function createRouterFn<TRouteTree extends AnyRoute>(
  options: { routeTree: TRouteTree } & Partial<RouterOptions<TRouteTree, any>>,
): AnyRouter
