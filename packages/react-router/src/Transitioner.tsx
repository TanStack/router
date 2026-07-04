'use client'

import * as React from 'react'
import { batch, useStore } from '@tanstack/react-store'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect, usePrevious } from './utils'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })

  const [isTransitioning, setIsTransitioning] = React.useState(false)
  // Track pending state changes
  const isLoading = useStore(router.stores.isLoading, (value) => value)
  const hasPending = useStore(router.stores.hasPending, (value) => value)

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = isLoading || isTransitioning || hasPending
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = isLoading || hasPending
  const previousIsPagePending = usePrevious(isPagePending)

  router.startTransition = (fn: () => void) => {
    setIsTransitioning(true)
    React.startTransition(() => {
      try {
        fn()
      } finally {
        // A throwing commit must not strand isTransitioning, which would
        // permanently block onResolved and the idle status transition.
        setIsTransitioning(false)
      }
    })
  }

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

    const tryLoad = async () => {
      try {
        await router.load()
      } catch (err) {
        console.error(err)
      }

      // A mount load can settle before this component observes the
      // isLoading flip (loads started before mount, or loads completing
      // within this effect's batch), leaving the router status stuck at
      // 'pending' so the load lifecycle events and onRendered never fire.
      // Repair is deferred one macrotask: when the flips WERE observed,
      // React's already-scheduled render/effects run first, emit the
      // events, and set status 'idle' via the onResolved effect — making
      // this a no-op. Only a genuinely unobserved load still reads
      // 'pending' here, and then this emits what the pipeline would have.
      setTimeout(() => {
        if (
          router.stores.status.get() === 'pending' &&
          !router.stores.isLoading.get() &&
          !router.stores.hasPending.get()
        ) {
          const changeInfo = getLocationChangeInfo(
            router.stores.location.get(),
            router.stores.resolvedLocation.get(),
          )
          router.emit({ type: 'onLoad', ...changeInfo })
          router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
          router.emit({ type: 'onResolved', ...changeInfo })
          batch(() => {
            router.stores.status.set('idle')
            router.stores.resolvedLocation.set(router.stores.location.get())
          })
        }
      }, 0)
    }

    tryLoad()
  }, [router])

  useLayoutEffect(() => {
    // The router was loading and now it's not
    if (previousIsLoading && !isLoading) {
      router.emit({
        type: 'onLoad', // When the new URL has committed, when the new matches have been loaded into state.matches
        ...getLocationChangeInfo(
          router.stores.location.get(),
          router.stores.resolvedLocation.get(),
        ),
      })
    }
  }, [previousIsLoading, router, isLoading])

  useLayoutEffect(() => {
    // emit onBeforeRouteMount
    if (previousIsPagePending && !isPagePending) {
      router.emit({
        type: 'onBeforeRouteMount',
        ...getLocationChangeInfo(
          router.stores.location.get(),
          router.stores.resolvedLocation.get(),
        ),
      })
    }
  }, [isPagePending, previousIsPagePending, router])

  useLayoutEffect(() => {
    if (previousIsAnyPending && !isAnyPending) {
      const changeInfo = getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )
      router.emit({
        type: 'onResolved',
        ...changeInfo,
      })

      batch(() => {
        router.stores.status.set('idle')
        router.stores.resolvedLocation.set(router.stores.location.get())
      })
    }
  }, [isAnyPending, previousIsAnyPending, router])

  return null
}
