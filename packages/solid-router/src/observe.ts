import * as Solid from 'solid-js'
import type { NavigationRef } from 'solid-js'
import type { AnyRouter, ParsedLocation } from '@tanstack/router-core'

/**
 * What the router says about its navigations to Solid's observe tier
 * (`OBSERVE.attribution.withOrigin`; `OBSERVE` is defined on the dev and
 * observe builds, undefined in production). A navigation is named by the
 * route pattern its pathname matches, so occurrences fold together; `to` and
 * `from` are the location's `href` — path, search and hash, as
 * `@solidjs/router` gives them, in the router's own path space (`name`'s,
 * before a basepath or rewrite is applied).
 */

/** When a navigation was requested, and the interaction it was requested in. */
export interface NavigationRequest {
  at: number
  /** Required: `undefined` declares that the request was for no interaction. */
  interaction: NavigationRef['interaction']
}

const requests = new WeakMap<AnyRouter, NavigationRequest>()
const held = new WeakSet<AnyRouter>()

/**
 * Records the navigation being requested now — a `commitLocation`, or a
 * blocker's `proceed` — for the history change it causes to answer. The
 * history may notify after awaiting its blockers, the interaction gone from
 * the stack by then; a later request replaces this one.
 */
export function noteRequest(router: AnyRouter): void {
  const observe = Solid.OBSERVE
  if (observe === undefined) return
  held.delete(router)
  requests.set(router, {
    at: performance.now(),
    interaction: observe.attribution.currentOrigin(),
  })
}

/** A blocker is deciding on the noted request: keep it past the commit. */
export function holdRequest(router: AnyRouter): void {
  if (requests.has(router)) held.add(router)
}

/**
 * The commit that noted the request has returned. Without a blocker
 * holding it, the history has notified by then — or never will: the same
 * location reloads without a history change.
 */
export function releaseRequest(router: AnyRouter): void {
  if (!held.has(router)) requests.delete(router)
}

/** Forgets the noted request: a blocker stopped the navigation it made. */
export function dropRequest(router: AnyRouter): void {
  held.delete(router)
  requests.delete(router)
}

/** The request noted for the history change being notified, if any. */
export function takeRequest(router: AnyRouter): NavigationRequest | undefined {
  const request = requests.get(router)
  dropRequest(router)
  return request
}

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

/** A destination a pending navigation was sent on from, and when. */
export interface NavigationHop {
  location: ParsedLocation
  at: number
}

/**
 * The navigation a match publish lands: the latest location, from `from`
 * (the location shown, or the arrival while the first page is still
 * loading). Nothing when the publish reloads the location it came from.
 * `request` dates it from the request and joins it to the interaction that
 * asked, both gone by the time the loaders resolve and the publish runs; the
 * key's presence declares the interaction, `undefined` included.
 *
 * One ref per destination, to be opened nested, as `@solidjs/router`
 * declares a navigation sent elsewhere while pending (a redirect, or
 * another navigation): the first names the destination requested, and each
 * `hops` entry is abandoned by a `redirect: n` ref the engine folds onto it,
 * keeping the request's time and interaction and listing the abandoned
 * destinations in `redirects`.
 */
export function describeNavigation(
  router: AnyRouter,
  request: NavigationRequest,
  from: ParsedLocation | undefined,
  hops: ReadonlyArray<NavigationHop>,
): Array<NavigationRef> | undefined {
  const to = router.latestLocation
  if (!from || (from.href === to.href && !hops.length)) return
  const destinations = [...hops.map((hop) => hop.location), to]
  return destinations.map((location, index) => {
    const ref: NavigationRef = {
      kind: 'navigation',
      ...describeRoute(router, location.pathname),
      to: location.href,
    }
    if (index) {
      ref.redirect = index
      ref.at = hops[index - 1]!.at
    } else {
      ref.from = from.href
      ref.at = request.at
      ref.interaction = request.interaction
    }
    return ref
  })
}

/**
 * The route the document arrived on, declared around the work that
 * establishes the router's initial match, since a fresh document has no
 * publish to wrap. On the client the engine opens it at the time origin and
 * settles it as that work returns (the first `"navigation"` record,
 * `initial: true`); on the server the same call names the request's
 * `"render"` record (`RenderEvent.route`). The fields are getters of
 * `location`, read at settle: the canonical location the client committed,
 * or the one a server load resolved.
 */
export function describeInitial(
  router: AnyRouter,
  location: () => ParsedLocation,
): NavigationRef {
  return {
    kind: 'navigation',
    initial: true,
    get to() {
      return location().href
    },
    get name() {
      return describeRoute(router, location().pathname).name
    },
    get params() {
      return describeRoute(router, location().pathname).params
    },
  }
}
