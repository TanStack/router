import { h } from 'preact'
import warning from 'tiny-warning'
import { DefaultGlobalNotFound } from './not-found'
import type { AnyRoute, AnyRouter } from '@tanstack/router-core'

/**
 * Renders a not found component for a route when no matching route is found.
 */
export function renderRouteNotFound(
  router: AnyRouter,
  route: AnyRoute,
  data: any,
) {
  if (!route.options.notFoundComponent) {
    if (router.options.defaultNotFoundComponent) {
      return h(router.options.defaultNotFoundComponent, data)
    }

    if (process.env.NODE_ENV === 'development') {
      warning(
        route.options.notFoundComponent,
        `A notFoundError was encountered on the route with ID "${route.id}", but a notFoundComponent option was not configured, nor was a router level defaultNotFoundComponent configured. Consider configuring at least one of these to avoid TanStack Router's overly generic defaultNotFoundComponent (<p>Not Found</p>)`,
      )
    }

    return <DefaultGlobalNotFound />
  }

  return h(route.options.notFoundComponent, data)
}
