import type { NavigationRef } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * What the router says about its navigations to Solid's observe tier
 * (`OBSERVE.attribution.withOrigin`; `OBSERVE` is defined on the dev and
 * observe builds, undefined in production). A navigation is named by the
 * route pattern its pathname matches, so occurrences fold together.
 */

/**
 * The route `pathname` matches — its `fullPath` (`/users/$id`) and the raw
 * params it bound — or, when no route matches it (a not-found, by the rule
 * `matchRoutes` applies), the pathname itself and no params.
 */
function describeRoute(
  router: AnyRouter,
  pathname: string,
): Pick<NavigationRef, 'name' | 'params'> {
  const [, rawParams, route] = router.getMatchedRoutes(pathname)
  if (!route || (route.path !== '/' && rawParams['**']))
    return { name: pathname }
  const { '**': _, ...params } = rawParams
  return Object.keys(params).length
    ? { name: route.fullPath, params }
    : { name: route.fullPath }
}

/**
 * The navigation a match publish lands: the latest location, from the one
 * shown. Nothing when nothing is shown yet (the initial load) or the publish
 * reloads what is shown. `at` dates it from the history change that started
 * the load.
 */
export function describeNavigation(
  router: AnyRouter,
  at: number | undefined,
): NavigationRef | undefined {
  const to = router.latestLocation
  const from = router.stores.resolvedLocation.get()
  if (!from || from.href === to.href) return
  const ref: NavigationRef = {
    kind: 'navigation',
    ...describeRoute(router, to.pathname),
    to: to.pathname,
    from: from.pathname,
  }
  if (at !== undefined) ref.at = at
  return ref
}
