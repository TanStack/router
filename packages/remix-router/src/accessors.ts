import { isNotFound, isRedirect } from '@tanstack/router-core'
import { RouterProvider } from './RouterProvider'
import { MatchContext } from './MatchContext'
import { subscribeStore } from './subscribe'
import type { Handle } from '@remix-run/ui'
import type { AnyRoute, AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

/**
 * Read the router instance from the nearest enclosing `<RouterProvider>`.
 * Throws if called outside a router tree.
 */
export function getRouter(handle: Handle<any, any>): AnyRouter {
  const router = handle.context.get(RouterProvider) as AnyRouter | undefined
  if (!router) {
    throw new Error(
      '@tanstack/remix-router: getRouter() called outside a <RouterProvider> tree.',
    )
  }
  return router
}

/**
 * Read the current matchId from the nearest enclosing `<Match>`.
 * Returns `undefined` at the root.
 */
export function getMatchId(handle: Handle<any, any>): string | undefined {
  return handle.context.get(MatchContext) as string | undefined
}

/**
 * Subscribe to the match for a specific route id (the strict variant).
 *
 * @example
 * ```ts
 * function UserDetail(handle: Handle) {
 *   const match = subscribeMatch(handle, '/users/$id')
 *   return () => <h1>{match()?.loaderData?.name}</h1>
 * }
 * ```
 */
export function subscribeMatch(
  handle: Handle<any, any>,
  routeId: string,
): () => AnyRouteMatch | undefined {
  const router = getRouter(handle)
  const store = router.stores.getRouteMatchStore(routeId)
  return subscribeStore(handle, store)
}

/**
 * Subscribe to the match for the current `<Match>` context. Useful from a
 * route component that doesn't want to hard-code its routeId.
 */
export function subscribeCurrentMatch(
  handle: Handle<any, any>,
): () => AnyRouteMatch | undefined {
  const router = getRouter(handle)
  const matchId = getMatchId(handle)
  if (!matchId) return () => undefined
  const store = router.stores.matchStores.get(matchId)
  if (!store) return () => undefined
  return subscribeStore(handle, store)
}

/**
 * Subscribe to the router's location store. Re-renders the calling component
 * on every location change.
 */
export function subscribeLocation(handle: Handle<any, any>) {
  const router = getRouter(handle)
  return subscribeStore(handle, router.stores.location)
}

/**
 * Subscribe to the array of active matches.
 */
export function subscribeMatches(handle: Handle<any, any>) {
  const router = getRouter(handle)
  return subscribeStore(handle, router.stores.matches)
}

/**
 * Resolve the route definition for a match, walking up if the matched route
 * has a parent. Convenience used internally by `<Match>`.
 */
export function getRoute(
  router: AnyRouter,
  match: AnyRouteMatch,
): AnyRoute {
  return router.routesById[match.routeId as string] as AnyRoute
}

/** Re-export the redirect/not-found type guards for convenience. */
export { isRedirect, isNotFound }
