import type { NavigateOptions } from './link'
import type { RoutePaths } from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type { PickAsRequired } from './utils'

export type AnyRedirect = Redirect<any, any, any, any, any>

export type Redirect<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = '/',
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = {
  href?: string
  /**
   * @deprecated Use `statusCode` instead
   **/
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
