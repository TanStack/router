import * as Vue from 'vue'
import { isServer } from '@tanstack/router-core/isServer'
import { routeModules } from '@tanstack/router-core/_internal/route-module'
import { routeIdContext } from './matchContext'
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
  const { navigate } = useRouter()
  // Only the route-module translation reads the nearest route, which route
  // modules install before any component sets up.
  const routeId = routeModules
    ? Vue.inject(routeIdContext, undefined)
    : undefined

  return ((options: NavigateOptions) => {
    return navigate(
      routeModules
        ? {
            // Route-module APIs also pass their internal `_module` and
            // `_fromRoute` scope; it resolves to the installation of the
            // nearest match.
            ..._defaultOpts,
            _nearestRoute: routeId,
            ...options,
          }
        : { from: _defaultOpts?.from, ...options },
    )
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

export const Navigate = Vue.defineComponent({
  name: 'Navigate',
  inheritAttrs: false,
  setup(_, { attrs }) {
    const router = useRouter()
    if (isServer ?? router.isServer) {
      return () => null
    }
    const navigate = useNavigate()
    const update = () => {
      void navigate({ ...attrs })
    }
    Vue.onMounted(update)
    Vue.onUpdated(update)
    return () => null
  },
}) as unknown as NavigateComponentFn
