import * as React from 'react'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { useLayoutEffect, usePrevious } from './utils'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })

  const [isTransitioning, setIsTransitioning] = React.useState(false)
  // Track pending state changes
  const { hasPendingMatches, isLoading } = useRouterState({
    select: (s) => ({
      isLoading: s.isLoading,
      hasPendingMatches: s.matches.some((d) => d.status === 'pending'),
    }),
    structuralSharing: true,
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = isLoading || isTransitioning || hasPendingMatches
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = isLoading || hasPendingMatches
  const previousIsPagePending = usePrevious(isPagePending)

  router.startTransition = (fn: () => void) => {
    setIsTransitioning(true)
    React.startTransition(() => {
      fn()
      setIsTransitioning(false)
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

    if (
      trimPathRight(router.latestLocation.href) !==
      trimPathRight(nextLocation.href)
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
    }

    tryLoad()
  }, [router])

  useLayoutEffect(() => {
    // The router was loading and now it's not
    if (previousIsLoading && !isLoading) {
      router.emit({
        type: 'onLoad', // When the new URL has committed, when the new matches have been loaded into state.matches
        ...getLocationChangeInfo(router.state),
      })
    }
  }, [previousIsLoading, router, isLoading])

  useLayoutEffect(() => {
    // emit onBeforeRouteMount
    if (previousIsPagePending && !isPagePending) {
      router.emit({
        type: 'onBeforeRouteMount',
        ...getLocationChangeInfo(router.state),
      })
    }
  }, [isPagePending, previousIsPagePending, router])

  useLayoutEffect(() => {
    if (previousIsAnyPending && !isAnyPending) {
      const changeInfo = getLocationChangeInfo(router.state)
      router.emit({
        type: 'onResolved',
        ...changeInfo,
      })

      router.__store.setState((s: typeof router.state) => ({
        ...s,
        status: 'idle',
        resolvedLocation: s.location,
      }))

      if (changeInfo.hrefChanged) {
        handleHashScroll(router)
      }
    }
  }, [isAnyPending, previousIsAnyPending, router])

  return null
}
