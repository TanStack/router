import {
  computed,
  effect,
  signal,
  DestroyRef,
  inject,
  afterNextRender,
} from '@angular/core'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { injectRouter } from './injectRouter'
import { injectRouterState } from './injectRouterState'
import type { AnyRouter } from '@tanstack/router-core'

// TODO: review

// Track mount state per router to avoid double-loading
let mountLoadForRouter: { router: AnyRouter | null; mounted: boolean } = {
  router: null,
  mounted: false,
}

/**
 * Helper function that sets up router transition logic.
 * This should be called from Matches component to set up:
 * - router.startTransition
 * - router.startViewTransition
 * - History subscription
 * - Router event watchers
 *
 * Must be called during component initialization.
 */
export function injectTransitionerSetup() {
  const router = injectRouter()

  // Skip on server - no transitions needed
  if (router.isServer) {
    return
  }

  const destroyRef = inject(DestroyRef)

  const isLoading = injectRouterState({
    select: (s) => s.isLoading,
  })

  // Track if we're in a transition
  const isTransitioning = signal(false)

  // Track pending state changes
  const hasPendingMatches = injectRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  // Track previous values for comparison
  let previousIsLoading: boolean | undefined
  let previousIsAnyPending: boolean | undefined
  let previousIsPagePending: boolean | undefined

  const isAnyPending = computed(
    () => isLoading() || isTransitioning() || hasPendingMatches(),
  )

  const isPagePending = computed(() => isLoading() || hasPendingMatches())

  // Implement startTransition similar to React/Solid
  // Angular doesn't have a native startTransition like React 18, so we simulate it
  router.startTransition = (fn: () => void | Promise<void>) => {
    isTransitioning.set(true)
    // Also update the router state so useMatch can check it
    try {
      router.__store.setState((s) => ({ ...s, isTransitioning: true }))
    } catch {
      // Ignore errors if component is unmounted
    }

    // Execute the function
    const result = fn()

    // Handle async functions
    if (result instanceof Promise) {
      result
        .then(() => {
          isTransitioning.set(false)
          try {
            router.__store.setState((s) => ({ ...s, isTransitioning: false }))
          } catch {
            // Ignore errors if component is unmounted
          }
        })
        .catch(() => {
          isTransitioning.set(false)
          try {
            router.__store.setState((s) => ({ ...s, isTransitioning: false }))
          } catch {
            // Ignore errors if component is unmounted
          }
        })
    } else {
      // For sync functions, use setTimeout to allow Angular to process updates
      setTimeout(() => {
        isTransitioning.set(false)
        try {
          router.__store.setState((s) => ({ ...s, isTransitioning: false }))
        } catch {
          // Ignore errors if component is unmounted
        }
      }, 0)
    }
  }

  // Angular doesn't have View Transitions API support like Vue, but we can still
  // set up the function for compatibility
  const originalStartViewTransition:
    | undefined
    | ((fn: () => Promise<void>) => void) =
    (router as any).__tsrOriginalStartViewTransition ??
    router.startViewTransition

  ;(router as any).__tsrOriginalStartViewTransition =
    originalStartViewTransition

  router.startViewTransition = (fn: () => Promise<void>) => {
    return originalStartViewTransition?.(fn)
  }

  // Subscribe to location changes and try to load the new location
  let unsubscribe: (() => void) | undefined

  afterNextRender(() => {
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
  const isMounted = signal(false)

  afterNextRender(() => {
    isMounted.set(true)
    if (!isAnyPending()) {
      router.__store.setState((s) =>
        s.status === 'pending'
          ? { ...s, status: 'idle', resolvedLocation: s.location }
          : s,
      )
    }
  })

  destroyRef.onDestroy(() => {
    isMounted.set(false)
    if (unsubscribe) {
      unsubscribe()
    }
  })

  // Try to load the initial location
  afterNextRender(() => {
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

  // Setup effects for emitting events
  // All effects check isMounted to prevent updates after unmount

  // Watch for onLoad event
  effect(() => {
    if (!isMounted()) return
    const currentIsLoading = isLoading()
    try {
      if (previousIsLoading && !currentIsLoading) {
        router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(router.state),
        })
      }
      previousIsLoading = currentIsLoading
    } catch {
      // Ignore errors if component is unmounted
    }
  })

  // Watch for onBeforeRouteMount event
  effect(() => {
    if (!isMounted()) return
    const currentIsPagePending = isPagePending()
    try {
      if (previousIsPagePending && !currentIsPagePending) {
        router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(router.state),
        })
      }
      previousIsPagePending = currentIsPagePending
    } catch {
      // Ignore errors if component is unmounted
    }
  })

  // Watch for onResolved event
  effect(() => {
    if (!isMounted()) return
    const currentIsAnyPending = isAnyPending()
    try {
      if (!currentIsAnyPending && router.__store.state.status === 'pending') {
        router.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }))
      }

      // The router was pending and now it's not
      if (previousIsAnyPending && !currentIsAnyPending) {
        const changeInfo = getLocationChangeInfo(router.state)
        router.emit({
          type: 'onResolved',
          ...changeInfo,
        })

        if (changeInfo.hrefChanged) {
          handleHashScroll(router)
        }
      }
      previousIsAnyPending = currentIsAnyPending
    } catch {
      // Ignore errors if component is unmounted
    }
  })
}
