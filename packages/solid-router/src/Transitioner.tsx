import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    return null
  }

  const previousTransition = router.startTransition
  const transition = async (fn: () => void) => {
    await Solid.startTransition(fn)
    return true
  }
  router.startTransition = transition
  Solid.onCleanup(() => {
    if (router.startTransition === transition) {
      router.startTransition = previousTransition
    }
  })

  // Subscribe to location changes
  // and try to load the new location
  Solid.onMount(() => {
    const unsub = router.history.subscribe(router.load)

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })

    // Check if the current URL matches the canonical form.
    // Compare publicHref (browser-facing URL) for consistency with
    // the server-side redirect check in router.beforeLoad.
    if (
      trimPathRight(router.latestLocation.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({ ...nextLocation, replace: true })
      return
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === router.latestLocation.href &&
      resolvedLocation.state.__TSR_key === router.latestLocation.state.__TSR_key
    ) {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
      })
    } else {
      router.load().catch(console.error)
    }

    Solid.onCleanup(() => {
      unsub()
    })
  })

  return null
}
