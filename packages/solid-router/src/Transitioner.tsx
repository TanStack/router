import * as Solid from 'solid-js'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = Solid.createMemo(() => router.stores.isLoading.state)

  const [isSolidTransitioning] = [() => false]

  // Track pending state changes
  const hasPendingMatches = Solid.createMemo(
    () => router.stores.hasPendingMatches.state,
  )

  const isAnyPending = Solid.createMemo(
    () => isLoading() || isSolidTransitioning() || hasPendingMatches(),
  )

  const isPagePending = Solid.createMemo(
    () => isLoading() || hasPendingMatches(),
  )

  router.startTransition = (fn: () => void | Promise<void>) => {
    Solid.runWithOwner(null, fn)
  }

  // Subscribe to location changes
  // and try to load the new location
  Solid.onSettled(() => {
    const unsub = router.history.subscribe(router.load)

    // Refresh latestLocation from the current browser URL before comparing.
    // The URL may have been changed synchronously (e.g. via replaceState) after
    // render() but before this effect ran, so we must not use the stale
    // render-time location here.
    router.updateLatestLocation()

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

    return () => {
      unsub()
    }
  })

  // Try to load the initial location
  Solid.createTrackedEffect(() => {
    Solid.untrack(() => {
      if (
        // if we are hydrating from SSR, loading is triggered in ssr-client
        (typeof window !== 'undefined' && router.ssr) ||
        (mountLoadForRouter.router === router && mountLoadForRouter.mounted)
      ) {
        return
      }
      mountLoadForRouter = { router, mounted: true }
      const tryLoad = async () => {
        try {
          await router.load()
        } catch (err) {
          console.error(err)
        }
      }
      tryLoad()
    })
  })

  Solid.createRenderEffect(
    () => isLoading(),
    (currentIsLoading, previousIsLoading) => {
      if (previousIsLoading && !currentIsLoading) {
        router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(
            router.stores.location.state,
            router.stores.resolvedLocation.state,
          ),
        })
      }
    },
  )

  Solid.createEffect(
    () => isPagePending(),
    (currentIsPagePending, previousIsPagePending) => {
      if (previousIsPagePending && !currentIsPagePending) {
        router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(
            router.stores.location.state,
            router.stores.resolvedLocation.state,
          ),
        })
      }
    },
  )

  Solid.createRenderEffect(
    () => isAnyPending(),
    (currentIsAnyPending, previousIsAnyPending) => {
      if (previousIsAnyPending && !currentIsAnyPending) {
        const changeInfo = getLocationChangeInfo(
          router.stores.location.state,
          router.stores.resolvedLocation.state,
        )
        router.emit({
          type: 'onResolved',
          ...changeInfo,
        })

        router.stores.status.setState(() => 'idle')
        router.stores.resolvedLocation.setState(
          () => router.stores.location.state,
        )

        if (changeInfo.hrefChanged) {
          handleHashScroll(router)
        }
      }
    },
  )

  return null
}
