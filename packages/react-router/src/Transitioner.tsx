'use client'

import * as React from 'react'
import { batch } from '@tanstack/react-store'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })

  // `transitioning` bridges router time and React time: raised before the
  // commit's startTransition, lowered by the tick effect below — which
  // React runs only after committing the transition render, keeping the
  // onResolved edge render-coupled. A counter (not a boolean) so nested
  // transitions can never coalesce into an unobservable no-change.
  const transitioning = React.useRef(false)
  const [transitionTick, setTransitionTick] = React.useState(0)

  const previous = React.useRef({
    isLoading: false,
    isPagePending: false,
    isAnyPending: false,
  })

  // Single emitter for the load lifecycle. Level changes arrive through
  // synchronous store subscriptions — which, unlike render-observed edges,
  // cannot lose a flip to React batching — plus the render-coupled
  // transition edge. One emitter means nothing to arbitrate.
  const emitEdges = React.useCallback(() => {
    const isLoading = router.stores.isLoading.get()
    const isPagePending = isLoading || router.stores.hasPending.get()
    const isAnyPending = isPagePending || transitioning.current
    const prev = previous.current
    previous.current = { isLoading, isPagePending, isAnyPending }

    const changeInfo = () =>
      getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )

    if (prev.isLoading && !isLoading) {
      // The new URL has committed and the new matches are in state.matches.
      router.emit({ type: 'onLoad', ...changeInfo() })
    }
    if (prev.isPagePending && !isPagePending) {
      router.emit({ type: 'onBeforeRouteMount', ...changeInfo() })
    }
    if (prev.isAnyPending && !isAnyPending) {
      router.emit({ type: 'onResolved', ...changeInfo() })
      batch(() => {
        router.stores.status.set('idle')
        router.stores.resolvedLocation.set(router.stores.location.get())
      })
    }
  }, [router])

  router.startTransition = (fn: () => void) => {
    transitioning.current = true
    // Register the rising transition level so the falling edge resolves
    // even when the load's own levels already settled.
    emitEdges()
    React.startTransition(() => {
      try {
        fn()
      } finally {
        // A throwing commit must not strand the transition level, which
        // would permanently block onResolved and the idle transition.
        setTransitionTick((tick) => tick + 1)
      }
    })
  }

  // Render-coupled falling edge: this effect runs only after React
  // committed the render that included the transition's tick bump.
  useLayoutEffect(() => {
    if (transitioning.current) {
      transitioning.current = false
      emitEdges()
    }
  }, [transitionTick, emitEdges])

  // Armed before the mount load below, so every load — including one that
  // settled before mount (the mount load below still toggles isLoading) —
  // produces an observable edge.
  useLayoutEffect(() => {
    const isLoading = router.stores.isLoading.get()
    const isPagePending = isLoading || router.stores.hasPending.get()
    const isAnyPending = isPagePending || transitioning.current
    previous.current = { isLoading, isPagePending, isAnyPending }

    const isLoadingSubscription = router.stores.isLoading.subscribe(emitEdges)
    const hasPendingSubscription = router.stores.hasPending.subscribe(emitEdges)
    return () => {
      isLoadingSubscription.unsubscribe()
      hasPendingSubscription.unsubscribe()
    }
  }, [router, emitEdges])

  // Subscribe to location changes
  // and try to load the new location
  React.useEffect(() => {
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

    return () => {
      unsub()
    }
  }, [router, router.history])

  // Try to load the initial location
  useLayoutEffect(() => {
    if (
      // if we are hydrating from SSR, loading is triggered in ssr-client
      (typeof window !== 'undefined' && router.ssr) ||
      (mountLoadForRouter.current.router === router &&
        mountLoadForRouter.current.mounted)
    ) {
      return
    }
    mountLoadForRouter.current = { router, mounted: true }

    router.load().catch((err) => {
      console.error(err)
    })
  }, [router])

  return null
}
