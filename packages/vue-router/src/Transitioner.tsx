import * as Vue from 'vue'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { usePrevious } from './utils'

// Track mount state per router to avoid double-loading
let mountLoadForRouter = { router: null as any, mounted: false }

/**
 * Composable that sets up router transition logic.
 * This is called from MatchesContent to set up:
 * - router.startTransition
 * - router.startViewTransition
 * - History subscription
 * - Router event watchers
 *
 * Must be called during component setup phase.
 */
export function useTransitionerSetup() {
  const router = useRouter()

  // Skip on server - no transitions needed
  if (isServer ?? router.isServer) {
    return
  }

  const isLoading = useRouterState({
    select: ({ isLoading }) => isLoading,
  })

  // Track if we're in a transition - using a ref to track async transitions
  const isTransitioning = Vue.ref(false)

  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(() => isLoading.value)

  const isAnyPending = Vue.computed(
    () => isLoading.value || isTransitioning.value || hasPendingMatches.value,
  )
  const previousIsAnyPending = usePrevious(() => isAnyPending.value)

  const isPagePending = Vue.computed(
    () => isLoading.value || hasPendingMatches.value,
  )
  const previousIsPagePending = usePrevious(() => isPagePending.value)

  // Implement startTransition similar to React/Solid
  // Vue doesn't have a native useTransition like React 18, so we simulate it
  // We also update the router state's isTransitioning flag so useMatch can check it
  router.startTransition = (fn: () => void | Promise<void>) => {
    isTransitioning.value = true
    // Also update the router state so useMatch knows we're transitioning
    try {
      router.__store.setState((s) => ({ ...s, isTransitioning: true }))
    } catch {
      // Ignore errors if component is unmounted
    }

    // Helper to end the transition
    const endTransition = () => {
      // Use nextTick to ensure Vue has processed all reactive updates
      Vue.nextTick(() => {
        try {
          isTransitioning.value = false
          router.__store.setState((s) => ({ ...s, isTransitioning: false }))
        } catch {
          // Ignore errors if component is unmounted
        }
      })
    }

    // Execute the function synchronously
    // The function internally may call startViewTransition which schedules async work
    // via document.startViewTransition, but we don't need to wait for it here
    // because Vue's reactivity will trigger re-renders when state changes
    fn()

    // End the transition on next tick to allow Vue to process reactive updates
    endTransition()
  }

  // Vue updates DOM asynchronously (next tick). The View Transitions API expects the
  // update callback promise to resolve only after the DOM has been updated.
  // Wrap the router-core implementation to await a Vue flush before resolving.
  const originalStartViewTransition:
    | undefined
    | ((fn: () => Promise<void>) => void) =
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

  // Track if component is mounted to prevent updates after unmount
  const isMounted = Vue.ref(false)

  Vue.onMounted(() => {
    isMounted.value = true
    if (!isAnyPending.value) {
      router.__store.setState((s) =>
        s.status === 'pending'
          ? { ...s, status: 'idle', resolvedLocation: s.location }
          : s,
      )
    }
  })

  Vue.onUnmounted(() => {
    isMounted.value = false
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

  // Setup watchers for emitting events
  // All watchers check isMounted to prevent updates after unmount
  Vue.watch(
    () => isLoading.value,
    (newValue) => {
      if (!isMounted.value) return
      try {
        if (previousIsLoading.value.previous && !newValue) {
          router.emit({
            type: 'onLoad',
            ...getLocationChangeInfo(router.state),
          })
        }
      } catch {
        // Ignore errors if component is unmounted
      }
    },
  )

  Vue.watch(isPagePending, (newValue) => {
    if (!isMounted.value) return
    try {
      // emit onBeforeRouteMount
      if (previousIsPagePending.value.previous && !newValue) {
        router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(router.state),
        })
      }
    } catch {
      // Ignore errors if component is unmounted
    }
  })

  Vue.watch(isAnyPending, (newValue) => {
    if (!isMounted.value) return
    try {
      if (!newValue && router.__store.state.status === 'pending') {
        router.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }))
      }

      // The router was pending and now it's not
      if (previousIsAnyPending.value.previous && !newValue) {
        const changeInfo = getLocationChangeInfo(router.state)
        router.emit({
          type: 'onResolved',
          ...changeInfo,
        })

        if (changeInfo.hrefChanged) {
          handleHashScroll(router)
        }
      }
    } catch {
      // Ignore errors if component is unmounted
    }
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
