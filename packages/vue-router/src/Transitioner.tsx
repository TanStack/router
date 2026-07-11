import * as Vue from 'vue'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { batch } from '@tanstack/vue-store'
import { useRouter } from './useRouter'

// Track mount state per router to avoid double-loading
let mountLoadForRouter = { router: null as any, mounted: false }

/**
 * Composable that sets up router transition logic.
 * This is called from MatchesContent to set up:
 * - router.startTransition
 * - router.startViewTransition
 * - History subscription
 * - Router lifecycle event emission
 *
 * Must be called during component setup phase.
 */
export function useTransitionerSetup() {
  const router = useRouter()

  // Skip on server - no transitions needed
  if (isServer ?? router.isServer) {
    return
  }

  // `transitioning` bridges router time and Vue time: raised before the
  // simulated transition runs, lowered by a single nextTick callback —
  // which runs only after Vue has flushed the reactive updates, keeping
  // the onResolved edge flush-coupled.
  let transitioning = false

  const previous: [boolean, boolean] = [false, false]

  // Change info captured at the loading falling edge, before resolvedLocation
  // advances. Reused for onResolved so it reports the navigation that actually
  // resolved instead of a from===to no-op.
  let resolvedChangeInfo: ReturnType<typeof getLocationChangeInfo> | undefined

  // Single emitter for the load lifecycle. Level changes arrive through
  // synchronous store subscriptions — which, unlike watcher-observed edges,
  // cannot lose a flip to Vue's flush batching — plus the flush-coupled
  // transition edge. One emitter means nothing to arbitrate.
  const emitEdges = () => {
    const isLoading = router.stores.isLoading.get()
    const isAnyPending = isLoading || transitioning
    const wasLoading = previous[0]
    const wasAnyPending = previous[1]
    previous[0] = isLoading
    previous[1] = isAnyPending

    const changeInfo = () =>
      getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )

    if (wasLoading && !isLoading) {
      // The new URL has committed and the new matches are in state.matches.
      resolvedChangeInfo = changeInfo()
      // Expose the completed location before lifecycle subscribers run. A
      // subscriber may synchronously start the next navigation; status remains
      // pending until Vue has flushed the completed navigation's render.
      router.stores.resolvedLocation.set(router.stores.location.get())
      router.emit({ type: 'onLoad', ...resolvedChangeInfo })
      router.emit({ type: 'onBeforeRouteMount', ...resolvedChangeInfo })
    }
    // Idle state and onResolved are flush-coupled to the transition edge so
    // public idle never precedes the destination DOM.
    if (wasAnyPending && !isAnyPending) {
      router.emit({
        type: 'onResolved',
        ...(resolvedChangeInfo ?? changeInfo()),
      })
      resolvedChangeInfo = undefined
      if (
        !router.stores.isLoading.get() &&
        router.stores.status.get() === 'pending'
      ) {
        router.stores.status.set('idle')
      }
    }
  }

  // Implement startTransition similar to React/Solid
  // Vue doesn't have a native useTransition like React 18, so we simulate it
  router.startTransition = (fn: () => void) => {
    transitioning = true
    // Register the rising transition level so the falling edge resolves
    // even when the load's own levels already settled.
    emitEdges()
    try {
      fn()
    } finally {
      // Flush-coupled falling edge: use nextTick so the transition level
      // only lowers after Vue has processed all reactive updates.
      void Vue.nextTick(() => {
        transitioning = false
        emitEdges()
      })
    }
  }

  // Armed before the mount load below, so every load — including one that
  // settled before mount (the mount load below still toggles isLoading) —
  // produces an observable edge.
  previous[0] = router.stores.isLoading.get()
  previous[1] = previous[0] || transitioning

  const isLoadingSubscription = router.stores.isLoading.subscribe(emitEdges)

  // Vue updates DOM asynchronously (next tick). The View Transitions API expects the
  // update callback promise to resolve only after the DOM has been updated.
  // Wrap the router-core implementation to await a Vue flush before resolving.
  const originalStartViewTransition: (
    fn: () => Promise<void>,
  ) => Promise<void> =
    (router as any).__tsrOriginalStartViewTransition ??
    router.startViewTransition

  ;(router as any).__tsrOriginalStartViewTransition =
    originalStartViewTransition

  router.startViewTransition = (fn: () => Promise<void>) => {
    return originalStartViewTransition(async () => {
      await fn()
      await Vue.nextTick()
    })
  }

  // Subscribe to location changes
  // and try to load the new location
  let unsubscribe: (() => void) | undefined

  Vue.onMounted(() => {
    unsubscribe = router.history.subscribe(router.load)

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
  })

  // One-shot idle repair at arm time: Vue's mount-load guard is
  // module-global, so a remount with the same router skips the mount load,
  // and a load that settled while unmounted produces no future edge.
  // Repair the stranded 'pending' status here.
  Vue.onMounted(() => {
    if (
      !router.stores.isLoading.get() &&
      !transitioning &&
      router.stores.status.get() === 'pending'
    ) {
      batch(() => {
        router.stores.status.set('idle')
        router.stores.resolvedLocation.set(router.stores.location.get())
      })
    }
  })

  Vue.onUnmounted(() => {
    ;(router as any).__tsrOnRenderedLocation = undefined
    isLoadingSubscription.unsubscribe()
    if (unsubscribe) {
      unsubscribe()
    }
  })

  // Try to load the initial location
  Vue.onMounted(() => {
    const currentLocation = router.stores.location.get()
    const locationIsCurrent =
      router.history.location.href === currentLocation.publicHref &&
      router.history.location.state.__TSR_key ===
        currentLocation.state.__TSR_key
    if (
      locationIsCurrent &&
      ((typeof window !== 'undefined' && router.ssr) ||
        (mountLoadForRouter.router === router && mountLoadForRouter.mounted))
    ) {
      return
    }
    mountLoadForRouter = { router, mounted: true }
    void router.load().catch((err) => console.error(err))
  })
}

/**
 * @deprecated Use useTransitionerSetup() composable instead.
 * This component is kept for backwards compatibility but the setup logic
 * has been moved to useTransitionerSetup() for better SSR hydration.
 */
export const Transitioner = Vue.defineComponent({
  name: 'Transitioner',
  setup() {
    useTransitionerSetup()
    return () => null
  },
})
