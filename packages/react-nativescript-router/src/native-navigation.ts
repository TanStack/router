import { resolveNativeRouteOptions } from '@tanstack/react-router/native'
import type {
  AnyRoute,
  AnyRouter,
  NavigateOptions,
  RouterState,
} from '@tanstack/router-core'

/** Apply NativeScript route identity and stack defaults to a navigation. */
export function resolveNativeScriptNavigateOptions<
  TRouter extends AnyRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  router: TRouter,
  options: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> {
  const location = router.buildLocation({
    ...options,
    _includeValidateSearch: true,
  })
  const matches = router.matchRoutes(location)
  const { options: routeOptions } = resolveNativeRouteOptions(router, {
    ...router.state,
    location,
    resolvedLocation: location,
    matches,
  } as RouterState<AnyRoute>)
  const { routeParams } = router.getMatchedRoutes(location.pathname)
  const nativeRouterOptions = router.options.native as
    | { defaultStackBehavior?: NavigateOptions['stackBehavior'] }
    | undefined
  const stackBehavior =
    options.stackBehavior ??
    (options.replace === true
      ? 'replace'
      : options.replace === false
        ? 'push'
        : (nativeRouterOptions?.defaultStackBehavior ?? 'reuse'))
  const stackMatch = options.stackMatch ?? routeOptions.stackMatch ?? 'nearest'
  const entryId =
    options.entryId ??
    routeOptions.getId?.({
      pathname: location.pathname,
      href: location.href,
      params: routeParams,
      search: location.search,
    }) ??
    location.href

  return {
    ...options,
    stackBehavior,
    stackMatch,
    entryId,
  }
}
