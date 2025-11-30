import * as Vue from 'vue'
import { getLocationChangeInfo, handleHashScroll, trimPathRight } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { usePrevious } from './utils'

export const Transitioner = Vue.defineComponent({
  name: 'Transitioner',
  setup() {
    const router = useRouter()
    let mountLoadForRouter = { router, mounted: false }

    if (router.isServer) {
      return () => null
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

    const isAnyPending = Vue.computed(() =>
      isLoading.value || isTransitioning.value || hasPendingMatches.value
    )
    const previousIsAnyPending = usePrevious(() => isAnyPending.value)

    const isPagePending = Vue.computed(() => isLoading.value || hasPendingMatches.value)
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

    // For Vue, we need to completely override startViewTransition because Vue's
    // async rendering doesn't work well with the View Transitions API's requirement
    // for synchronous DOM updates. The browser expects the DOM to be updated
    // when the callback promise resolves, but Vue updates asynchronously.
    //
    // Our approach: Skip the actual view transition animation but still update state.
    // This ensures navigation works correctly even without the visual transition.
    // In the future, we could explore using viewTransition.captured like vue-view-transitions does.
    router.startViewTransition = (fn: () => Promise<void>) => {
      // Just run the callback directly without wrapping in document.startViewTransition
      // This ensures the state updates happen and Vue can render them normally
      fn()
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

      if (
        trimPathRight(router.latestLocation.href) !==
        trimPathRight(nextLocation.href)
      ) {
        router.commitLocation({ ...nextLocation, replace: true })
      }
    })

    // Track if component is mounted to prevent updates after unmount
    const isMounted = Vue.ref(false)

    Vue.onMounted(() => {
      isMounted.value = true
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
      }
    )

    Vue.watch(
      isPagePending,
      (newValue) => {
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
      }
    )

    Vue.watch(
      isAnyPending,
      (newValue) => {
        if (!isMounted.value) return
        try {
          // The router was pending and now it's not
          if (previousIsAnyPending.value.previous && !newValue) {
            const changeInfo = getLocationChangeInfo(router.state)
            router.emit({
              type: 'onResolved',
              ...changeInfo,
            })

            router.__store.setState((s) => ({
              ...s,
              status: 'idle',
              resolvedLocation: s.location,
            }))

            if (changeInfo.hrefChanged) {
              handleHashScroll(router)
            }
          }
        } catch {
          // Ignore errors if component is unmounted
        }
      }
    )

    return () => null
  }
})
