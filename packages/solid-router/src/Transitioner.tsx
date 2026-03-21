import * as Solid from 'solid-js'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { ParsedLocation } from '@tanstack/router-core'

/**
 * Inline version of handleHashScroll that accepts a pre-captured location
 * to avoid reading router.stores.location.state inside an effect callback
 * (which would trigger a Solid v2 reactive warning).
 */
function handleHashScrollWithLocation(_router: any, location: ParsedLocation) {
  if (typeof document !== 'undefined' && (document as any).querySelector) {
    const hashScrollIntoViewOptions =
      location.state.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions && location.hash !== '') {
      const el = document.getElementById(location.hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }
  }
}

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
    const unsub = router.history.subscribe(() => {
      queueMicrotask(() => router.load())
    })

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
  // In Solid v2, signal updates inside onSettled cannot be flushed
  // synchronously (flush() throws). router.load() sets signals via batch(),
  // and the code that runs immediately after needs those values committed.
  // By deferring to queueMicrotask, the load runs outside the reactive
  // scheduling frame so flush() works correctly.
  Solid.onSettled(() => {
    if (
      // if we are hydrating from SSR, loading is triggered in ssr-client
      (typeof window !== 'undefined' && router.ssr) ||
      (mountLoadForRouter.router === router && mountLoadForRouter.mounted)
    ) {
      return
    }
    mountLoadForRouter = { router, mounted: true }
    queueMicrotask(() => {
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

  const locationState = Solid.createMemo(() => router.stores.location.state)
  const resolvedLocationState = Solid.createMemo(
    () => router.stores.resolvedLocation.state,
  )

  Solid.createRenderEffect(
    () =>
      [
        isLoading(),
        isPagePending(),
        isAnyPending(),
        locationState(),
        resolvedLocationState(),
      ] as const,
    (
      [
        currentIsLoading,
        currentIsPagePending,
        currentIsAnyPending,
        loc,
        resolvedLoc,
      ],
      prev,
    ) => {
      // Guard: if location state isn't available yet, skip all event emissions
      if (!loc) return

      const previousIsLoading = prev?.[0]
      const previousIsPagePending = prev?.[1]
      const previousIsAnyPending = prev?.[2]

      // onLoad: when the router finishes loading
      if (previousIsLoading && !currentIsLoading) {
        router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(loc, resolvedLoc),
        })
      }

      // onBeforeRouteMount: must fire before onResolved
      if (previousIsPagePending && !currentIsPagePending) {
        router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(loc, resolvedLoc),
        })
      }

      // onResolved: fires after onBeforeRouteMount
      if (previousIsAnyPending && !currentIsAnyPending) {
        const changeInfo = getLocationChangeInfo(loc, resolvedLoc)
        router.emit({
          type: 'onResolved',
          ...changeInfo,
        })

        router.stores.status.setState(() => 'idle')
        // Use `loc` from the source tuple to avoid reading
        // router.stores.location.state inside the effect callback
        router.stores.resolvedLocation.setState(() => loc)

        if (changeInfo.hrefChanged) {
          // Pass the already-captured location to avoid a reactive read
          // inside the effect callback (handleHashScroll would otherwise
          // read router.stores.location.state which triggers a warning)
          handleHashScrollWithLocation(router, loc)
        }
      }
    },
  )

  return null
}
