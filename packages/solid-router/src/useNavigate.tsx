import * as Solid from 'solid-js'
import { isServer } from '@tanstack/router-core/isServer'
import { nearestMatchContext } from './matchContext'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  CompatibleRouteScope,
  FromPathOption,
  NavigateOptions,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  RouteModuleScope,
  UseNavigateResult,
} from '@tanstack/router-core'

/**
 * The signature of `useNavigate`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useNavigate` of this type.
 */
export type UseNavigateFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
  _module?: RouteModuleScope<CompatibleRouteScope<TRouter>>
}) => UseNavigateResult<TDefaultFrom, { router: TRouter }>

export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom, { router: TRouter }> {
  const router = useRouter()
  // A live match never changes route, so read it once without tracking.
  const routeId = Solid.useContext(nearestMatchContext)[0 /* routeId */]()

  return ((options: NavigateOptions) => {
    return router.navigate({
      // Route-module APIs also pass their internal `_module`/`_fromRoute`
      // scope; it resolves to the installation of the nearest match.
      ..._defaultOpts,
      _nearestRoute: routeId,
      ...options,
      from: options.from ?? _defaultOpts?.from,
    })
  }) as UseNavigateResult<TDefaultFrom, { router: TRouter }>
}

/**
 * The signature of `Navigate`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `Navigate` of this type.
 */
export type NavigateComponentFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => null

export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const router = useRouter()
  if (isServer ?? router.isServer) {
    return null
  }
  const navigate = useNavigate()

  Solid.createEffect(
    Solid.on(
      () => ({ ...props }),
      (options) => navigate(options),
    ),
  )

  return null
}
