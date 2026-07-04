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

  const previous = {
    isLoading: false,
    isPagePending: false,
    isAnyPending: false,
  }

  // Single emitter for the load lifecycle. Level changes arrive through
  // synchronous store subscriptions — which, unlike watcher-observed edges,
  // cannot lose a flip to Vue's flush batching — plus the flush-coupled
  // transition edge. One emitter means nothing to arbitrate.
  const emitEdges = () => {
    const isLoading = router.stores.isLoading.get()
    const isPagePending = isLoading || router.stores.hasPending.get()
    const isAnyPending = isPagePending || transitioning
    const prev = { ...previous }
    previous.isLoading = isLoading
    previous.isPagePending = isPagePending
    previous.isAnyPending = isAnyPending

    const changeInfo = () =>
      getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )

    if (prev.isLoading && !isLoading) {
      // The new URL has committed and the new matches are in state.matches.
      router.emit({ type: 'onLoad', ...changeInfo() })
    }
    // Commit idle/resolvedLocation on the FIRST falling edge (guarded for
    // idempotence): these store updates join the same reactive flush as the
    // new matches, so matchRoute/status consumers can never render one
    // flush behind the committed lane. Only the onResolved EVENT is
    // flush-coupled to the deferred transition edge.
    const commitIdle = () => {
      if (router.stores.status.get() === 'pending') {
        batch(() => {
          router.stores.status.set('idle')
          router.stores.resolvedLocation.set(router.stores.location.get())
        })
      }
    }
    if (prev.isPagePending && !isPagePending) {
      router.emit({ type: 'onBeforeRouteMount', ...changeInfo() })
      commitIdle()
    }
    if (prev.isAnyPending && !isAnyPending) {
      router.emit({ type: 'onResolved', ...changeInfo() })
      commitIdle()
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
  previous.isLoading = router.stores.isLoading.get()
  previous.isPagePending =
    previous.isLoading || router.stores.hasPending.get()
  previous.isAnyPending = previous.isPagePending || transitioning

  const subscriptions = [
    router.stores.isLoading.subscribe(emitEdges),
    router.stores.hasPending.subscribe(emitEdges),
  ]

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
    return originalStartViewTransition?.(async () => {
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
      !router.stores.hasPending.get() &&
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
    for (const subscription of subscriptions) {
      subscription.unsubscribe()
    }
    if (unsubscribe) {
      unsubscribe()
    }
  })

  // Try to load the initial location
  Vue.onMounted(() => {
    if (
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
