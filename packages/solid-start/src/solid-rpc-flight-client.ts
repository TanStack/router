import * as solidServerFunctions from '@solidjs/web/server-functions/client'
import { subscribeFlightData } from '@solidjs/web/server-functions/client'
import type { AnyRouteMatch, AnyRouter } from '@tanstack/solid-router'
import { getRouterInstance } from '@tanstack/start-client-core'
import { SOLID_START_FLIGHT_SOURCE } from './solid-rpc-flight'
import type {
  SolidStartFlightData,
  SolidStartFlightMatch,
} from './solid-rpc-flight'

// Named flight sources (Solid's multi-source single-flight protocol) ship
// in the @solidjs/web release after 2.0.0-rc.4 — detected by an export the
// protocol introduced. When present, the router subscribes under its own
// source id and receives exactly its slice of the keyed envelope, so other
// caches' consumers (e.g. solid-query's "sq") coexist on the same mutation
// response. On older versions this falls back to the unnamed legacy slot,
// matching the server half's detection of the same installed package.
const hasNamedFlightSources = 'getFlightDataSourceIds' in solidServerFunctions
const subscribeNamedFlightData = subscribeFlightData as unknown as <D>(
  source: string,
  consumer: (data: D, context: { response: Response }) => void | Promise<void>,
) => () => void

let subscribed = false

export function subscribeSolidStartFlightData() {
  if (subscribed) {
    return
  }
  subscribed = true

  const subscribe = hasNamedFlightSources
    ? (consumer: (data: SolidStartFlightData) => Promise<void>) =>
        subscribeNamedFlightData<SolidStartFlightData>(
          SOLID_START_FLIGHT_SOURCE,
          consumer,
        )
    : subscribeFlightData<SolidStartFlightData>

  subscribe(async (data) => {
    if (!isSolidStartFlightData(data)) {
      return
    }

    const router = await getRouterInstance()
    if ('dehydratedData' in data) {
      await router.options.hydrate?.(data.dehydratedData as never)
    }

    const currentLocation = isCurrentLocation(router, data.href)
    const matches = currentLocation
      ? router.stores.matches.get()
      : router.matchRoutes(router.buildLocation({ href: data.href } as never))
    if (matches.length !== data.matches.length) {
      return
    }

    const flightMatches = new Map(
      data.matches.map((match) => [match.id, match]),
    )
    const hydratedMatches: Array<AnyRouteMatch> = []
    for (const match of matches) {
      const flightMatch = flightMatches.get(match.id)
      if (!flightMatch) {
        return
      }
      hydratedMatches.push(applyFlightMatch(match, flightMatch))
    }

    if (currentLocation) {
      publishCurrentMatches(router, hydratedMatches)
    } else {
      seedRedirectMatches(router, hydratedMatches)
    }
  })
}

function applyFlightMatch(
  match: AnyRouteMatch,
  flightMatch: SolidStartFlightMatch,
): AnyRouteMatch {
  const hasRouteState =
    flightMatch.loaderData !== undefined ||
    flightMatch.beforeLoadContext !== undefined ||
    'error' in flightMatch ||
    flightMatch.notFound === true ||
    match.error !== undefined ||
    match._notFound === true

  if (!hasRouteState) {
    return match
  }

  const nextMatch = {
    ...match,
    error: flightMatch.error,
    invalid: false,
    isFetching: false,
    preload: false,
    status: flightMatch.status,
    updatedAt: flightMatch.updatedAt,
    _flight: undefined,
    _notFound: flightMatch.notFound,
  } as AnyRouteMatch

  if ('loaderData' in flightMatch) {
    nextMatch.loaderData = flightMatch.loaderData
  }
  if ('beforeLoadContext' in flightMatch) {
    ;(
      nextMatch as AnyRouteMatch & { __beforeLoadContext?: unknown }
    ).__beforeLoadContext = flightMatch.beforeLoadContext
    nextMatch.context = {
      ...nextMatch.context,
      ...(flightMatch.beforeLoadContext as object | undefined),
    }
  }
  if ('ssr' in flightMatch) {
    nextMatch.ssr = flightMatch.ssr
  }

  return nextMatch
}

function publishCurrentMatches(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
) {
  for (const match of matches) {
    router._cache.delete(match.id)
  }
  router._committed = matches
  router.batch(() => {
    router.stores.setMatches(matches)
    router.stores.status.set('idle')
    router.stores.resolvedLocation.set(router.stores.location.get())
  })
}

function seedRedirectMatches(router: AnyRouter, matches: Array<AnyRouteMatch>) {
  for (const match of matches) {
    router._cache.set(match.id, {
      ...match,
      context: {},
      preload: true,
    })
  }
}

function isCurrentLocation(router: AnyRouter, href: string) {
  const current = new URL(router.latestLocation.href, window.location.href)
  const target = new URL(href, current)
  return (
    current.pathname === target.pathname &&
    current.search === target.search &&
    current.hash === target.hash
  )
}

function isSolidStartFlightData(value: unknown): value is SolidStartFlightData {
  return (
    isObject(value) &&
    typeof value.href === 'string' &&
    Array.isArray(value.matches)
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}
