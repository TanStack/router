import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { describeInitial, describeNavigation, takeRequest } from './observe'
import type { NavigationRequest } from './observe'
import type { RouterHistory } from '@tanstack/history'
import type { AnyRouteMatch, ParsedLocation } from '@tanstack/router-core'

/** What the history tells its subscribers. */
type HistoryChange = Parameters<Parameters<RouterHistory['subscribe']>[0]>[0]

/** The history change was the arrival's own canonicalization, not a request. */
const ARRIVAL = Symbol()

/**
 * `offerPending`'s publish: a match still `pending` at or above the
 * not-found boundary. The matches below a not-found never load, and stay
 * `pending` in the publish that lands; an offer whose pending match is
 * below one already shows the destination, the not-found.
 */
function isPendingOffer(matches: Array<AnyRouteMatch>) {
  for (const match of matches) {
    if (match.status === 'pending') return true
    if (match._notFound) return false
  }
  return false
}

function getResolvedLocation(router: ReturnType<typeof useRouter>) {
  const resolvedLocation = router.stores.resolvedLocation.get()
  if (
    resolvedLocation?.href === router.latestLocation.href &&
    resolvedLocation.state.__TSR_key === router.latestLocation.state.__TSR_key
  ) {
    return resolvedLocation
  }
  return
}

export function Transitioner() {
  const router = useRouter()

  type Ack = [
    expected: Array<AnyRouteMatch>,
    resolve: (rendered: boolean) => void,
  ]
  const acks: Array<Ack> = []
  let committed: Array<AnyRouteMatch> | undefined

  const isCommitted = (expected: Array<AnyRouteMatch>) =>
    !!committed &&
    committed.length === expected.length &&
    expected.every((match, index) => committed![index] === match)

  // Solid's observe tier attributes what the user waited on to the
  // navigation that caused it: wrap the write whose landing is the
  // destination showing — here the match publish, after router-core awaited
  // the loaders — and describe the request, which predates it. The first
  // history change since the last publish is that request: when the user
  // asked, and the interaction they asked in, gone from the stack by the time
  // the publish runs. `ARRIVAL` when the change was the arrival being
  // canonicalized (below): the initial declaration already covers it.
  let request: NavigationRequest | typeof ARRIVAL | undefined
  let canonicalizing = false
  // The location the initial declaration names, canonical: what a navigation
  // is from until the first publish resolves one (a redirect while it loads).
  let arrival: ParsedLocation | undefined

  // Ack when the commit's transition settles (the atomic swap), not when the
  // flush parks it; superseded or rolled-back commits resolve false.
  router.startTransition = (fn, expectedMatches) => {
    if (isServer ?? router.isServer) {
      fn()
      return Promise.resolve(true)
    }
    return new Promise((resolve) => {
      const ack: Ack = [expectedMatches, resolve]
      acks.push(ack)
      let publish = fn
      // The pending offer (`offerPending`) is not the destination: published
      // undeclared, the request kept for the publish that lands. Every other
      // publish answers the request.
      if (Solid.OBSERVE !== undefined && !isPendingOffer(expectedMatches)) {
        const answered = request
        request = undefined
        const ref =
          answered === undefined || answered === ARRIVAL
            ? undefined
            : describeNavigation(
                router,
                answered,
                router.stores.resolvedLocation.get() ?? arrival,
              )
        if (ref !== undefined) {
          const observe = Solid.OBSERVE
          publish = () => observe.attribution.withOrigin(ref, fn)
        }
      }
      Solid.runWithOwner(null, publish)
      try {
        Solid.flush()
      } catch {
        // Solid auto-flushes when this is called from a reactive context.
      }
      // A commit that changed nothing produces no settlement to observe.
      if (acks.includes(ack) && isCommitted(expectedMatches)) {
        acks.splice(acks.indexOf(ack), 1)
        resolve(true)
      }
    })
  }

  // No server early-return here or below: Solid 2 derives hydration keys
  // from the reactive owner tree, so the server must register the same slots
  // as the client. The callbacks themselves never run on the server.
  Solid.createEffect(
    () => router.stores.matches.get(),
    (current) => {
      committed = current
      if (acks.length) {
        for (const [expected, resolve] of acks.splice(0)) {
          resolve(isCommitted(expected))
        }
      }
    },
  )

  Solid.onSettled(() => {
    const unsub = router.history.subscribe(({ action }: HistoryChange) => {
      if (Solid.OBSERVE !== undefined) {
        // A push or replace was requested through `commitLocation`, maybe
        // before an `await` on the blockers; anything else is the browser
        // moving, requested now.
        const noted =
          action.type === 'PUSH' || action.type === 'REPLACE'
            ? takeRequest(router)
            : undefined
        if (canonicalizing) request ??= ARRIVAL
        else if (request === undefined || request === ARRIVAL) {
          request = noted ?? {
            at: performance.now(),
            interaction: Solid.OBSERVE.attribution.currentOrigin(),
          }
        }
      }
      queueMicrotask(() => router.load().catch(console.error))
    })

    // The route the document arrived on is declared around establishing it,
    // canonicalization included, as `@solidjs/router` does: the record
    // names the canonical location, and the commit is the arrival's.
    const establish = () => {
      // The URL may have changed synchronously between render and settlement.
      router.updateLatestLocation()
      const nextLocation = router.buildLocation({
        to: router.latestLocation.pathname,
        search: true,
        params: true,
        hash: true,
        state: true,
        _includeValidateSearch: true,
      })

      if (
        trimPathRight(router.latestLocation.publicHref) !==
        trimPathRight(nextLocation.publicHref)
      ) {
        arrival = nextLocation
        // The history notifies synchronously inside the commit (no blocker
        // to await), so the subscriber above sees the flag.
        canonicalizing = true
        try {
          router.commitLocation({
            ...nextLocation,
            replace: true,
            ignoreBlocker: true,
          })
        } finally {
          canonicalizing = false
        }
        return
      }

      arrival = router.latestLocation
      if (!getResolvedLocation(router) && !router._tx) {
        queueMicrotask(() => router.load().catch(console.error))
      }
    }

    const observe = Solid.OBSERVE
    if (observe !== undefined) {
      observe.attribution.withOrigin(
        describeInitial(router, () => arrival ?? router.latestLocation),
        establish,
      )
    } else establish()

    return unsub
  })

  return null
}

export function Rendered() {
  const router = useRouter()
  Solid.onSettled(() => {
    const resolvedLocation = getResolvedLocation(router)
    if (resolvedLocation) {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
      })
    }
  })
  return null
}
