import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

/**
 * Internal component that handles router loading and transitions.
 * Calls router.load() on mount and subscribes to history changes.
 */
export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })

  const isLoading = useRouterState({
    select: (s) => s.isLoading,
  })

  const previousIsLoading = React.useRef(isLoading)

  // Subscribe to location changes and load new locations
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

  // Load the initial location on mount
  React.useEffect(() => {
    if (
      mountLoadForRouter.current.router === router &&
      mountLoadForRouter.current.mounted
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

  // Emit onLoad event when loading completes
  React.useEffect(() => {
    if (previousIsLoading.current && !isLoading) {
      router.emit({
        type: 'onLoad',
        ...getLocationChangeInfo(router.state),
      })
    }
    previousIsLoading.current = isLoading
  }, [router, isLoading])

  return null
}
