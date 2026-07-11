'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  const routerState = React.useRef({ router, mounted: false, generation: 0 })
  const routerChanged = routerState.current.router !== router
  if (routerChanged) {
    routerState.current = {
      router,
      mounted: false,
      generation: routerState.current.generation + 1,
    }
  }
  const generation = routerState.current.generation

  // `transitioning` bridges router time and React time: raised before the
  // commit's startTransition, lowered by the tick effect below — which
  // React runs only after committing the transition render, keeping the
  // onResolved edge render-coupled.
  const transitioning = React.useRef(false)
  const [transitionTick, setTransitionTick] = React.useState(0)
  const resolvedChangeInfo = React.useRef<
    ReturnType<typeof getLocationChangeInfo> | undefined
  >(undefined)

  const previous = React.useRef<[isLoading: boolean, isAnyPending: boolean]>([
    false,
    false,
  ])

  if (routerChanged) {
    transitioning.current = false
    resolvedChangeInfo.current = undefined
    previous.current = [false, false]
  }

  // Single emitter for the load lifecycle. Level changes arrive through
  // synchronous store subscriptions — which, unlike render-observed edges,
  // cannot lose a flip to React batching — plus the render-coupled
  // transition edge. One emitter means nothing to arbitrate.
  const emitEdges = React.useCallback(() => {
    const isLoading = router.stores.isLoading.get()
    const isAnyPending = isLoading || transitioning.current
    const [wasLoading, wasAnyPending] = previous.current
    previous.current = [isLoading, isAnyPending]

    const changeInfo = () =>
      getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )

    if (wasLoading && !isLoading) {
      // The new URL has committed and the new matches are in state.matches.
      const info = changeInfo()
      resolvedChangeInfo.current = info
      // Expose the completed location before lifecycle subscribers run. A
      // subscriber may synchronously start the next navigation; status stays
      // pending until React commits the completed navigation's render.
      router.stores.resolvedLocation.set(router.stores.location.get())
      router.emit({ type: 'onLoad', ...info })
      router.emit({ type: 'onBeforeRouteMount', ...info })
    }
    if (wasAnyPending && !isAnyPending) {
      const info = resolvedChangeInfo.current ?? changeInfo()
      resolvedChangeInfo.current = undefined
      router.emit({ type: 'onResolved', ...info })
      if (!router.stores.isLoading.get()) {
        router.stores.status.set('idle')
      }
    }
  }, [router])

  router.startTransition = (fn: () => void) => {
    if (routerState.current.generation !== generation) {
      React.startTransition(fn)
      return
    }
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
        if (routerState.current.generation === generation) {
          setTransitionTick((tick) => tick + 1)
        }
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
    const isAnyPending = isLoading || transitioning.current
    previous.current = [isLoading, isAnyPending]

    const isLoadingSubscription = router.stores.isLoading.subscribe(emitEdges)
    return () => {
      isLoadingSubscription.unsubscribe()
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
    const historyLocation = router.history.location
    const storeLocation = router.stores.location.get()
    const historyChangedWhileUnmounted =
      historyLocation.href !== storeLocation.publicHref ||
      historyLocation.state.__TSR_key !== storeLocation.state.__TSR_key

    // Hydration already loaded the first location, but persistent `router.ssr`
    // must not hide a history change that happened while this provider was
    // unmounted and unsubscribed.
    if (
      !historyChangedWhileUnmounted &&
      ((typeof window !== 'undefined' && router.ssr) ||
        (routerState.current.router === router && routerState.current.mounted))
    ) {
      return
    }
    routerState.current.mounted = true

    router.load().catch((err) => {
      console.error(err)
    })
  }, [router])

  return null
}
