import type { AnyRouteMatch } from '@tanstack/solid-router'

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
