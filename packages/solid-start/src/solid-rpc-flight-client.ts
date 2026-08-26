import { subscribeFlightData } from '@solidjs/web/server-functions/client'
import type { AnyRouteMatch, AnyRouter } from '@tanstack/solid-router'
import { getRouterInstance } from '@tanstack/start-client-core'
import type {
  SolidStartFlightData,
  SolidStartFlightMatch,
} from './solid-rpc-flight'

let subscribed = false

export function subscribeSolidStartFlightData() {
  if (subscribed) {
    return
  }
  subscribed = true

  subscribeFlightData<SolidStartFlightData>(async (data) => {
    if (!isSolidStartFlightData(data)) {
      return
    }

    const router = await getRouterInstance()
    if ('dehydratedData' in data) {
      await router.options.hydrate?.(data.dehydratedData as never)
    }

    const location = router.buildLocation({ href: data.href } as never)
    const matches = router.matchRoutes(location)
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

    if (isCurrentLocation(router, data.href)) {
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
