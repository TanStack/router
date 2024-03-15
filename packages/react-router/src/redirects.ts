import { PickAsRequired } from '.'
import { NavigateOptions } from './link'
import { AnyRoute } from './route'
import { RoutePaths } from './routeInfo'
import { RegisteredRouter } from './router'

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
} & NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>

export type ResolvedRedirect<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
> = PickAsRequired<
  Redirect<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
  'code' | 'statusCode' | 'href'
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
  if (opts.throw ?? true) {
    throw opts
  }

  return opts
}

export function isRedirect(obj: any): obj is AnyRedirect {
  return !!obj?.isRedirect
}
