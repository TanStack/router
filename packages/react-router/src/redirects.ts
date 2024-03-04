import { NavigateOptions } from './link'
import { AnyRoute } from './route'
import { RoutePaths } from './routeInfo'
import { RegisteredRouter } from './router'

// Detect if we're in the DOM

export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = {
  code?: number
  throw?: any
  href?: string
} & NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>

export function redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
>(
  opts: Redirect<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): Redirect<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> {
  ;(opts as any).isRedirect = true
  if (opts.throw ?? true) {
    throw opts
  }

  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}
