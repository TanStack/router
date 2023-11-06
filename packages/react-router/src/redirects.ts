import { NavigateOptions } from './link'
import { AnyRoute } from './route'
import { RoutePaths } from './routeInfo'
import { RegisteredRouter } from './router'

// Detect if we're in the DOM

export type AnyRedirect = Redirect<any, any, any>

export type Redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  code?: number
}

export function redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
>(opts: Redirect<TRouteTree, TFrom, TTo>): Redirect<TRouteTree, TFrom, TTo> {
  ;(opts as any).isRedirect = true
  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}
