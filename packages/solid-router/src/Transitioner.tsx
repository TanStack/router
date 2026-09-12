import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { NavigationRef } from 'solid-js'
import type { AnyRouteMatch } from '@tanstack/router-core'

/**
 * Solid's observe tier (`OBSERVE` is defined on the dev and observe builds,
 * undefined in production) attributes what the user waited on to the
 * navigation that caused it. The rule for every router is the same: wrap the
 * write whose landing is the destination showing, and pass `at` when the
 * request predates that write. Here that write is the match publish inside
 * `startTransition` — the loaders were awaited in router-core before it —
 * so the ref names the destination route from the expected matches and
 * dates from the history change that started the load. The pending offer
 * (`offerPending`, a match with `status: 'pending'`) is not the destination
 * and is published undeclared; the initial load and a same-location reload
 * are not navigations.
 */
function describeNavigation(
  router: ReturnType<typeof useRouter>,
  expected: Array<AnyRouteMatch>,
  at: number | undefined,
): NavigationRef | undefined {
  if (expected.some((match) => match.status === 'pending')) return
  const to = router.latestLocation
  const from = router.stores.resolvedLocation.get()
  // Nothing shown yet (the initial load), or a reload of what is shown.
  if (!from || from.href === to.href) return
  const leaf = expected[expected.length - 1]
  const ref: NavigationRef = {
    kind: 'navigation',
    name: leaf?.fullPath || to.pathname,
    to: to.pathname,
    from: from.pathname,
  }
  if (leaf && Object.keys(leaf.params).length) ref.params = leaf.params
  if (at !== undefined) ref.at = at
  return ref
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

  // When the history changed since the last declared publish: the moment
  // the user asked, which is where the navigation's wait starts.
  let requestedAt: number | undefined

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
      if (Solid.OBSERVE !== undefined) {
        const ref = describeNavigation(router, expectedMatches, requestedAt)
        if (ref !== undefined) {
          requestedAt = undefined
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
    const unsub = router.history.subscribe(() => {
      requestedAt ??= performance.now()
      queueMicrotask(() => router.load().catch(console.error))
    })

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
      router.commitLocation({
        ...nextLocation,
        replace: true,
        ignoreBlocker: true,
      })
      return unsub
    }

    if (!getResolvedLocation(router) && !router._tx) {
      queueMicrotask(() => router.load().catch(console.error))
    }

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
