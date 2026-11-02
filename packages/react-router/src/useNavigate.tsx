'use client'

import * as React from 'react'
import { isServer } from '@tanstack/router-core/isServer'
import { matchContext } from './matchContext'
import { useLayoutEffect } from './utils'
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

/**
 * Imperative navigation hook.
 *
 * Returns a stable `navigate(options)` function to change the current location
 * programmatically. Prefer the `Link` component for user-initiated navigation,
 * and use this hook from effects, callbacks, or handlers where imperative
 * navigation is required.
 *
 * Options:
 * - `from`: Optional route base used to resolve relative `to` paths.
 *
 * @returns A function that accepts `NavigateOptions`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useNavigateHook
 */
export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom, { router: TRouter }> {
  const router = useRouter()
  const routeId = React.useContext(matchContext)

  return React.useCallback(
    (options: NavigateOptions) => {
      return router.navigate({
        // Route-module APIs also pass their internal `_module`/`_fromRoute`
        // scope, constant for a route or scoped API. It resolves to the
        // installation of the nearest match.
        ..._defaultOpts,
        _nearestRoute: routeId,
        ...options,
        from: options.from ?? _defaultOpts?.from,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scope of the defaults is constant
    [_defaultOpts?.from, routeId, router],
  ) as UseNavigateResult<TDefaultFrom, { router: TRouter }>
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

/**
 * Component that triggers a navigation when rendered. Navigation executes
 * in an effect after mount/update.
 *
 * Props are the same as `NavigateOptions` used by `navigate()`.
 *
 * @returns null
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/navigateComponent
 */
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
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the server condition is static
  const navigate = useNavigate()

  // eslint-disable-next-line react-hooks/rules-of-hooks -- the server condition is static
  const previousPropsRef = React.useRef<NavigateOptions<
    TRouter,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  > | null>(null)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the server condition is static
  useLayoutEffect(() => {
    if (previousPropsRef.current !== props) {
      navigate(props)
      previousPropsRef.current = props
    }
  }, [router, props, navigate])
  return null
}
