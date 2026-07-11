import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = Solid.createMemo(() => router.stores.isLoading.get())

  if (isServer ?? router.isServer) {
    return null
  }

  const [isSolidTransitioning, startSolidTransition] = Solid.useTransition()

  const isAnyPending = Solid.createMemo(
    () => isLoading() || isSolidTransitioning(),
  )
  let resolvedChangeInfo: ReturnType<typeof getLocationChangeInfo> | undefined

  router.startTransition = (fn: () => void | Promise<void>) => {
    Solid.startTransition(() => {
      startSolidTransition(fn)
    })
  }

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
    }

    Solid.onCleanup(() => {
      unsub()
      ;(router as any).__tsrRendered = undefined
    })
  })

  // Try to load the initial location
  Solid.createRenderEffect(() => {
    Solid.untrack(() => {
      const currentLocation = router.stores.location.get()
      if (
        // if we are hydrating from SSR, loading is triggered in ssr-client
        (typeof window !== 'undefined' &&
          router.ssr &&
          router.history.location.href ===
            currentLocation.publicHref &&
          router.history.location.state.__TSR_key ===
            currentLocation.state.__TSR_key) ||
        (mountLoadForRouter.router === router && mountLoadForRouter.mounted)
      ) {
        return
      }
      mountLoadForRouter = { router, mounted: true }
      void router.load().catch((err) => console.error(err))
    })
  })

  Solid.createComputed((previousIsLoading = false) => {
    const currentIsLoading = isLoading()

    if (previousIsLoading && !currentIsLoading) {
      const nextResolvedLocation = router.stores.location.get()
      resolvedChangeInfo = getLocationChangeInfo(
        nextResolvedLocation,
        router.stores.resolvedLocation.get(),
      )
      // Expose the completed location before lifecycle subscribers run. A
      // subscriber may synchronously start the next navigation; status stays
      // pending until Solid commits the completed navigation's render.
      router.stores.resolvedLocation.set(nextResolvedLocation)
      router.emit({
        type: 'onLoad',
        ...resolvedChangeInfo,
      })
      router.emit({
        type: 'onBeforeRouteMount',
        ...resolvedChangeInfo,
      })
    }

    return currentIsLoading
  })

  Solid.createRenderEffect((previousIsAnyPending = false) => {
    const currentIsAnyPending = isAnyPending()

    if (previousIsAnyPending && !currentIsAnyPending) {
      const nextResolvedLocation = router.stores.location.get()
      const changeInfo =
        resolvedChangeInfo ??
        getLocationChangeInfo(
          nextResolvedLocation,
          router.stores.resolvedLocation.get(),
        )
      resolvedChangeInfo = undefined
      router.emit({
        type: 'onResolved',
        ...changeInfo,
      })

      if (!router.stores.isLoading.get()) {
        router.stores.status.set('idle')
      }
    }

    return currentIsAnyPending
  })

  return null
}
