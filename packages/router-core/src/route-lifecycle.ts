import type { AnyRouteMatch } from './Matches'
import type { ParsedLocation } from './location'
import type { LoadTransaction } from './load-client'
import type { AnyRoute } from './route'
import type { AnyRouter } from './router'

/**
 * Compute whether path, href or hash changed between previous and current
 * resolved locations.
 */
export function getLocationChangeInfo(
  location: ParsedLocation,
  resolvedLocation?: ParsedLocation,
) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}

/** Return the end of the active match branch, including its first fallback. */
export function lifecycleEnd(matches: Array<AnyRouteMatch>) {
  return (
    matches.findIndex(
      (match) =>
        match.status === 'error' ||
        match.status === 'notFound' ||
        match._notFound,
    ) + 1
  )
}

/** Run route lifecycle callbacks in leave/enter/stay phases. */
export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
  previousEnd: number | undefined,
  nextEnd: number,
  owner?: LoadTransaction,
): void {
  // Zero or undefined means the full branch; copy only at a fallback.
  if (previousEnd) {
    previous = previous.slice(0, previousEnd)
  }
  if (nextEnd) {
    matches = matches.slice(0, nextEnd)
  }
  for (const match of previous) {
    if (owner && router._tx !== owner) {
      return
    }
    if (!matches.some((candidate) => candidate.routeId === match.routeId)) {
      ;(router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!.options.onLeave?.(match)
    }
  }
  for (const match of matches) {
    if (owner && router._tx !== owner) {
      return
    }
    const route = (router.routesById as Record<string, AnyRoute>)[
      match.routeId
    ]!
    route.options[
      previous.some((candidate) => candidate.routeId === match.routeId)
        ? 'onStay'
        : 'onEnter'
    ]?.(match)
  }
}
