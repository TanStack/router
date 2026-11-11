import type { NavigateOptions, ToOptions } from './link'
import type { ParsedLocation } from './location'
import type { RoutePaths } from './routeInfo'
import type { AnyRouter, Register, ViewTransitionOptions } from './router'
import type { RegisteredRouterOf } from './route-module'

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
}

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  viewTransition?: boolean | ViewTransitionOptions
  /**
   * @deprecated All navigations use transitions under the hood now
   **/
  startTransition?: boolean
  ignoreBlocker?: boolean
}

export type NavigateFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  // A default equal to the constraint keeps the inference of a destination-less
  // call unchanged while allowing the router type to have a default.
  TTo extends string | undefined = string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Promise<void>

export type BuildLocationFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  // A default equal to the constraint keeps the inference of a destination-less
  // call unchanged while allowing the router type to have a default.
  TTo extends string | undefined = string | undefined,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {
    leaveParams?: boolean
    _includeValidateSearch?: boolean
    _isNavigate?: boolean
  },
) => ParsedLocation
