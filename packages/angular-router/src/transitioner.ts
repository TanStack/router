import * as Angular from '@angular/core'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { injectRouter } from './injectRouter'
import { injectRouterState } from './injectRouterState'
import type { AnyRouter } from '@tanstack/router-core'

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
 *
 * This is more complicated than the other adapters, since Angular
 * does not have transition support and a mechanism to wait for the next tick.
 */
export function injectTransitionerSetup() {
  const router = injectRouter()
  const environmentInjector = Angular.inject(Angular.EnvironmentInjector)

  // Skip on server - no transitions needed
  if (router.isServer) return

  const destroyRef = Angular.inject(Angular.DestroyRef)

  const isLoading = injectRouterState({
    select: (s) => s.isLoading,
  })

  // Track if we're in a transition
  const isTransitioning = Angular.signal(false)

  // Track pending state changes
  const hasPendingMatches = injectRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const isAnyPending = Angular.computed(
    () => isLoading() || isTransitioning() || hasPendingMatches(),
  )

  const isPagePending = Angular.computed(
    () => isLoading() || hasPendingMatches(),
  )

  // Track previous values for comparison using proper previous value tracking
  const prevIsLoading = injectPrevious(() => isLoading())
  const prevIsAnyPending = injectPrevious(() => isAnyPending())
  const prevIsPagePending = injectPrevious(() => isPagePending())

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

    // Helper to end the transition
    const endTransition = () => {
      // Use afterNextRender to ensure Angular has processed all change detection
      // This is similar to Vue's nextTick approach
      Angular.afterNextRender(
        {
          read: () => {
            try {
              isTransitioning.set(false)
              router.__store.setState((s) => ({ ...s, isTransitioning: false }))
            } catch {
              // Ignore errors if component is unmounted
            }
          },
        },
        { injector: environmentInjector },
      )
    }

    const result = fn()

    if (result instanceof Promise) {
      result.finally(() => endTransition())
    } else {
      endTransition()
    }
  }

  // Subscribe to location changes and try to load the new location
  let unsubscribe: (() => void) | undefined

  Angular.afterNextRender(() => {
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
  const isMounted = Angular.signal(false)

  Angular.afterNextRender(() => {
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
  Angular.afterNextRender(() => {
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
  Angular.effect(() => {
    if (!isMounted()) return
    try {
      if (prevIsLoading() && !isLoading()) {
        router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(router.state),
        })
      }
    } catch {
      // Ignore errors if component is unmounted
    }
  })

  // Watch for onBeforeRouteMount event
  Angular.effect(() => {
    if (!isMounted()) return
    try {
      if (prevIsPagePending() && !isPagePending()) {
        router.emit({
          type: 'onBeforeRouteMount',
          ...getLocationChangeInfo(router.state),
        })
      }
    } catch {
      // Ignore errors if component is unmounted
    }
  })

  // Watch for onResolved event
  Angular.effect(() => {
    if (!isMounted()) return
    try {
      if (
        prevIsAnyPending() &&
        !isAnyPending() &&
        router.__store.state.status === 'pending'
      ) {
        router.__store.setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }))
      }

      // The router was pending and now it's not
      if (prevIsAnyPending() && !isAnyPending()) {
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

export function injectPrevious<T>(
  fn: () => NonNullable<T>,
): Angular.Signal<T | null> {
  const value = Angular.computed(fn)
  let previousValue: T | null = null

  return Angular.computed(() => {
    // We known value is different that the previous one,
    // thanks to signal memoization.
    const lastPreviousValue = previousValue
    previousValue = value()
    return lastPreviousValue
  })
}
