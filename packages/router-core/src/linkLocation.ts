import type { ParsedLocation } from './location'
import type { AnyRouter } from './router'

/** Whether the current candidate omits an owner of outgoing presentation. */
export function isRouteLeaving(
  router: AnyRouter,
  location: ParsedLocation,
  routeId: string,
): boolean {
  // HMR may replace membership without publishing another location.
  if (process.env.NODE_ENV === 'development') {
    return false
  }
  const tx = router._tx
  return !!(
    tx &&
    tx[2 /* location */] === location &&
    !tx[0 /* controller */].signal.aborted &&
    // Commit consumes the lane before incoming components read presentation.
    tx[3 /* matches */].length &&
    !tx[3 /* matches */].some((match) => match.routeId === routeId)
  )
}
