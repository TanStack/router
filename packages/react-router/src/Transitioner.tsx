import * as React from 'react'
import { useLayoutEffect, usePrevious } from './utils'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { trimPathRight } from './path'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })
  const isLoading = useRouterState({
    select: ({ isLoading }) => isLoading,
  })

  const [isTransitioning, setIsTransitioning] = React.useState(false)
  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
    structuralSharing: true,
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = isLoading || isTransitioning || hasPendingMatches
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = isLoading || hasPendingMatches
  const previousIsPagePending = usePrevious(isPagePending)

  if (!router.isServer) {
    router.startReactTransition = (fn: () => void) => {
      setIsTransitioning(true)
      React.startTransition(() => {
        fn()
        setIsTransitioning(false)
      })
    }
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
      (typeof window !== 'undefined' && window.__TSR__?.dehydrated) ||
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
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.pathname !== toLocation.pathname
      const hrefChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onLoad', // When the new URL has committed, when the new matches have been loaded into state.matches
        fromLocation,
        toLocation,
        pathChanged,
        hrefChanged,
      })
    }
  }, [previousIsLoading, router, isLoading])

  useLayoutEffect(() => {
    // emit onBeforeRouteMount
    if (previousIsPagePending && !isPagePending) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.pathname !== toLocation.pathname
      const hrefChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onBeforeRouteMount',
        fromLocation,
        toLocation,
        pathChanged,
        hrefChanged,
      })
    }
  }, [isPagePending, previousIsPagePending, router])

  useLayoutEffect(() => {
    // The router was pending and now it's not
    if (previousIsAnyPending && !isAnyPending) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.pathname !== toLocation.pathname
      const hrefChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onResolved',
        fromLocation,
        toLocation,
        pathChanged,
        hrefChanged,
      })

      router.__store.setState((s) => ({
        ...s,
        status: 'idle',
        resolvedLocation: s.location,
      }))

      if (typeof document !== 'undefined' && (document as any).querySelector) {
        const hashScrollIntoViewOptions =
          router.state.location.state.__hashScrollIntoViewOptions ?? true

        if (hashScrollIntoViewOptions && router.state.location.hash !== '') {
          const el = document.getElementById(router.state.location.hash)
          if (el) {
            el.scrollIntoView(hashScrollIntoViewOptions)
          }
        }
      }
    }
  }, [isAnyPending, previousIsAnyPending, router])

  return null
}
