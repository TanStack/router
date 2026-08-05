import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

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

  if (isServer ?? router.isServer) {
    return null
  }

  router.startTransition = async (fn) => {
    const result = Solid.runWithOwner(null, fn)
    try {
      Solid.flush()
    } catch {
      // Solid auto-flushes when this is called from a reactive context.
    }
    await result
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    return true
  }

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
