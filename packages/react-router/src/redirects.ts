import type { NavigateOptions } from './link'
import type { AnyRoute } from './route'
import type { RoutePaths } from './routeInfo'
import type { RegisteredRouter } from './router'
import type { PickAsRequired } from './utils'

export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = {
  /**
   * @deprecated Use `statusCode` instead
   **/
  href?: string
  code?: number
  statusCode?: number
  throw?: any
  headers?: HeadersInit
} & NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>

export type ResolvedRedirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = PickAsRequired<
  Redirect<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
  'code' | 'statusCode' | 'href' | 'headers'
>

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
  opts.statusCode = opts.statusCode || opts.code || 301
  opts.headers = opts.headers || {}
  if (opts.throw) {
    throw opts
  }

  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}
