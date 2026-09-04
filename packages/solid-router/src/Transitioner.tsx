import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
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
      Solid.runWithOwner(null, fn)
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
