import * as Vue from 'vue'
import { useRouter } from './useRouter'
import { DefaultGlobalNotFound } from './not-found'
import type { AnyRoute } from '@tanstack/router-core'

// Simplified type for NotFoundError
interface NotFoundError {
  routeId?: string
  pathname?: string
  search?: string
  href?: string
}

export function renderRouteNotFound(
  router: ReturnType<typeof useRouter>,
  route: AnyRoute,
  error?: NotFoundError,
): Vue.VNode {
  // Prepare the props
  const data: NotFoundError = {
    routeId: route.id,
    pathname: error?.pathname || router.state.location.pathname,
    search: error?.search || router.state.location.search,
    href: error?.href || router.state.location.href,
  }

  if (route.isRoot && router.options.defaultNotFoundComponent) {
    return Vue.h(router.options.defaultNotFoundComponent, { data })
  }

  if (router.options.defaultNotFoundComponent && !route.options.notFoundComponent) {
    return Vue.h(router.options.defaultNotFoundComponent, { data })
  }

  if (route.options.notFoundComponent) {
    return Vue.h(route.options.notFoundComponent, { data })
  }

  return Vue.h(DefaultGlobalNotFound)
}
