import type { AnyRouter, NavigateOptions } from '@tanstack/router-core'
import type { NativeRouteOptionsInput } from './route'
import { resolveNativeRouteOptions } from './resolveNativeRouteOptions'

function mergeNativeOptions(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
) {
  return {
    ...previous,
    ...next,
    headerStyle:
      (previous as any)?.headerStyle || (next as any).headerStyle
        ? {
            ...(((previous as any)?.headerStyle ?? {}) as Record<
              string,
              unknown
            >),
            ...(((next as any).headerStyle ?? {}) as Record<string, unknown>),
          }
        : undefined,
  }
}

type ResolveOptions = NavigateOptions & {
  stackBehavior?: 'auto' | 'push' | 'replace' | 'reuse'
  stackMatch?: 'nearest' | 'oldest'
  entryId?: string
}

export function resolveNativeNavigateOptions<TRouter extends AnyRouter>(
  router: TRouter,
  options: ResolveOptions,
): ResolveOptions {
  const builtLocation = router.buildLocation({
    ...options,
    _includeValidateSearch: true,
  } as any)

  const routeMatch = router.getMatchedRoutes(builtLocation.pathname)
  let native: Record<string, unknown> | undefined
  routeMatch.matchedRoutes.forEach((route) => {
    const nativeInput = (route.options as any)?.native as
      | NativeRouteOptionsInput
      | undefined
    const resolved = resolveNativeRouteOptions(nativeInput, {
      pathname: builtLocation.pathname,
      params: routeMatch.routeParams,
      search: builtLocation.search,
      loaderData: undefined,
      context: undefined,
      canGoBack: router.history.canGoBack(),
    })

    if (!resolved) {
      return
    }

    const { minStackState: _minStackState, ...rest } = resolved
    native = mergeNativeOptions(native, rest as Record<string, unknown>)
  })

  const stackBehavior = options.stackBehavior ?? 'reuse'
  const stackMatch =
    options.stackMatch ?? (native as any)?.stackMatch ?? 'nearest'

  let entryId = options.entryId
  if (!entryId) {
    const getId = (native as any)?.getId

    if (getId) {
      entryId = getId({
        pathname: builtLocation.pathname,
        params: routeMatch.routeParams,
        search: builtLocation.search,
      })
    } else {
      entryId = builtLocation.pathname
    }
  }

  return {
    ...options,
    stackBehavior,
    stackMatch,
    entryId,
  }
}
