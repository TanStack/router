import type { NavigateOptions } from './link'
import type { RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { PickAsRequired } from './utils'

export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
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
} & NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type ResolvedRedirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> = TFrom,
  TMaskTo extends string = '',
> = PickAsRequired<
  Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  'code' | 'statusCode' | 'headers'
> & {
  href: string
}

export function redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Redirect<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> {
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

export function isResolvedRedirect(obj: any): obj is ResolvedRedirect {
  return !!obj?.isRedirect && obj.href
}
