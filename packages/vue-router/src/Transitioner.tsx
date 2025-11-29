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
    // Vue doesn't have a native useTransition, so we simulate it
    router.startTransition = (fn: () => void | Promise<void>) => {
      isTransitioning.value = true

      // Execute the function
      const result = fn()

      // If the function returns a promise, wait for it
      if (result && typeof result.then === 'function') {
        result.finally(() => {
          // Use nextTick to ensure Vue has processed all reactive updates
          Vue.nextTick(() => {
            isTransitioning.value = false
          })
        })
      } else {
        // For synchronous functions, defer the transition end to next tick
        // This allows Vue to batch any reactive updates
        Vue.nextTick(() => {
          isTransitioning.value = false
        })
      }
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

    Vue.onUnmounted(() => {
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
    Vue.watch(
      () => isLoading.value,
      (newValue) => {
        if (previousIsLoading.value.previous && !newValue) {
          router.emit({
            type: 'onLoad',
            ...getLocationChangeInfo(router.state),
          })
        }
      }
    )

    Vue.watch(
      isPagePending,
      (newValue) => {
        // emit onBeforeRouteMount
        if (previousIsPagePending.value.previous && !newValue) {
          router.emit({
            type: 'onBeforeRouteMount',
            ...getLocationChangeInfo(router.state),
          })
        }
      }
    )

    Vue.watch(
      isAnyPending,
      (newValue) => {
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
      }
    )

    return () => null
  }
})
