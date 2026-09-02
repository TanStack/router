import type { AnyRouteMatch } from '@tanstack/solid-router'

/**
 * The router's single-flight source id on Solid's multi-source flight
 * channel. Mutation responses fold one slice per cache — the router's
 * loader/match data rides under this id, coexisting with other caches'
 * slices (e.g. solid-query's `"sq"`) on the same round trip instead of
 * competing for the single unnamed consumer slot. Requires the
 * `@solidjs/web` release after 2.0.0-rc.4; both halves feature-detect and
 * fall back to the unnamed slot on older versions.
 */
export const SOLID_START_FLIGHT_SOURCE = 'tsr'

export interface SolidStartFlightMatch {
  id: string
  beforeLoadContext?: unknown
  error?: unknown
  loaderData?: unknown
  notFound?: true
  ssr?: AnyRouteMatch['ssr']
  status: AnyRouteMatch['status']
  updatedAt: number
}

export interface SolidStartFlightData {
  dehydratedData?: unknown
  href: string
  matches: Array<SolidStartFlightMatch>
}

export function createSolidStartFlightMatch(
  match: AnyRouteMatch,
): SolidStartFlightMatch {
  const flightMatch: SolidStartFlightMatch = {
    id: match.id,
    status: match.status,
    updatedAt: match.updatedAt,
  }

  if ('__beforeLoadContext' in match) {
    flightMatch.beforeLoadContext = match.__beforeLoadContext
  }
  if ('loaderData' in match) {
    flightMatch.loaderData = match.loaderData
  }
  if (match.error !== undefined) {
    flightMatch.error = match.error
  }
  if (match.ssr !== undefined) {
    flightMatch.ssr = match.ssr
  }
  if (match._notFound) {
    flightMatch.notFound = true
  }

  return flightMatch
}
