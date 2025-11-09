import type { AnyRouter } from '@tanstack/router-core'

/**
 * Get match data for a specific route by routeId
 * This is a vanilla JS equivalent of useMatch hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get match data for
 * @returns Match data for the route, or undefined if not found
 */
export function getMatchData<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
): TRouter['state']['matches'][0] | undefined {
  return router.state.matches.find((match) => match.routeId === routeId)
}

/**
 * Get params for a specific route by routeId
 * This is a vanilla JS equivalent of useParams hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get params for
 * @param strict - Whether to use strict params (default: true)
 * @returns Params for the route, or undefined if route not found
 */
export function getParams<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
  strict: boolean = true,
): any {
  const match = getMatchData(router, routeId)
  if (!match) return undefined

  const matchState = router.getMatch(match.id)
  if (!matchState) return undefined

  return strict ? matchState._strictParams : matchState.params
}

/**
 * Get search params for a specific route by routeId
 * This is a vanilla JS equivalent of useSearch hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get search params for
 * @returns Search params for the route, or undefined if route not found
 */
export function getSearch<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
): any {
  const match = getMatchData(router, routeId)
  if (!match) return undefined

  const matchState = router.getMatch(match.id)
  return matchState?.search
}

/**
 * Get loader data for a specific route by routeId
 * This is a vanilla JS equivalent of useLoaderData hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get loader data for
 * @returns Loader data for the route, or undefined if route not found or loader hasn't run
 */
export function getLoaderData<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
): any {
  const match = getMatchData(router, routeId)
  if (!match) return undefined

  const matchState = router.getMatch(match.id)
  return matchState?.loaderData
}

/**
 * Get route context for a specific route by routeId
 * This is a vanilla JS equivalent of useRouteContext hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get context for
 * @returns Route context for the route, or undefined if route not found
 */
export function getRouteContext<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
): any {
  const match = getMatchData(router, routeId)
  if (!match) return undefined

  const matchState = router.getMatch(match.id)
  return matchState?.context
}

/**
 * Get loader dependencies for a specific route by routeId
 * This is a vanilla JS equivalent of useLoaderDeps hook
 *
 * @param router - The router instance
 * @param routeId - The route ID to get loader deps for
 * @returns Loader dependencies for the route, or undefined if route not found
 */
export function getLoaderDeps<TRouter extends AnyRouter>(
  router: TRouter,
  routeId: string,
): any {
  const match = getMatchData(router, routeId)
  if (!match) return undefined

  const matchState = router.getMatch(match.id)
  return matchState?.loaderDeps
}
