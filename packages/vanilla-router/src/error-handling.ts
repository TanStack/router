import type { AnyRouter, AnyRouteMatch } from '@tanstack/router-core'
import { isNotFound, isRedirect } from '@tanstack/router-core'
import type {
  VanillaErrorRouteComponent,
  VanillaNotFoundRouteComponent,
} from './types'

/**
 * Check if an error is a NotFoundError
 *
 * @param error - The error to check
 * @returns True if the error is a NotFoundError
 */
export function checkIsNotFound(
  error: unknown,
): error is import('@tanstack/router-core').NotFoundError {
  return isNotFound(error)
}

/**
 * Check if an error is a Redirect
 *
 * @param error - The error to check
 * @returns True if the error is a Redirect
 */
export function checkIsRedirect(
  error: unknown,
): error is import('@tanstack/router-core').Redirect {
  return isRedirect(error)
}

/**
 * Get the error component for a match
 * This checks the route's errorComponent option and falls back to router's defaultErrorComponent
 *
 * @param router - The router instance
 * @param match - The match to get error component for
 * @returns The error component factory function, or undefined if none configured
 */
export function getErrorComponent<TRouter extends AnyRouter>(
  router: TRouter,
  match: AnyRouteMatch,
): VanillaErrorRouteComponent | undefined {
  const route = router.routesById[match.routeId]
  if (!route) return undefined

  const errorComponent =
    route.options.errorComponent === false
      ? undefined
      : (route.options.errorComponent ?? router.options.defaultErrorComponent)

  return errorComponent
}

/**
 * Get the not found component for a match
 * This checks the route's notFoundComponent option and falls back to router's defaultNotFoundComponent
 *
 * @param router - The router instance
 * @param match - The match to get not found component for
 * @returns The not found component factory function, or undefined if none configured
 */
export function getNotFoundComponent<TRouter extends AnyRouter>(
  router: TRouter,
  match: AnyRouteMatch,
): VanillaNotFoundRouteComponent | undefined {
  const route = router.routesById[match.routeId]
  if (!route) return undefined

  const notFoundComponent =
    route.options.notFoundComponent === false
      ? undefined
      : (route.options.notFoundComponent ??
        router.options.defaultNotFoundComponent)

  return notFoundComponent
}

// Re-export isNotFound and isRedirect for convenience
export { isNotFound, isRedirect } from '@tanstack/router-core'
