import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { describeNavigation } from './observe'
import type { AnyRouteMatch } from '@tanstack/router-core'

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
  // the loaders — and pass `at`, since the request predates it. The first
  // history change since the last declared publish is that request: the
  // moment the user asked, which is where the navigation's wait starts.
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
      // The pending offer (`offerPending`, a match with `status: 'pending'`)
      // is not the destination: published undeclared.
      if (
        Solid.OBSERVE !== undefined &&
        !expectedMatches.some((match) => match.status === 'pending')
      ) {
        const ref = describeNavigation(router, requestedAt)
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
