import * as React from 'react'
import { pick, useLayoutEffect, usePrevious } from './utils'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef({ router, mounted: false })
  const routerState = useRouterState({
    select: (s) =>
      pick(s, ['isLoading', 'location', 'resolvedLocation', 'isTransitioning']),
  })

  const [isTransitioning, startReactTransition_] = React.useTransition()
  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(routerState.isLoading)

  const isAnyPending =
    routerState.isLoading || isTransitioning || hasPendingMatches
  const previousIsAnyPending = usePrevious(isAnyPending)

  router.startReactTransition = startReactTransition_

  const tryLoad = async () => {
    try {
      await router.load()
    } catch (err) {
      console.error(err)
    }
  }

  // Subscribe to location changes
  // and try to load the new location
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(router.load)

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
    })

    if (routerState.location.href !== nextLocation.href) {
      router.commitLocation({ ...nextLocation, replace: true })
    }

    return () => {
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.history])

  // Try to load the initial location
  useLayoutEffect(() => {
    if (
      window.__TSR_DEHYDRATED__ ||
      (mountLoadForRouter.current.router === router &&
        mountLoadForRouter.current.mounted)
    ) {
      return
    }
    mountLoadForRouter.current = { router, mounted: true }
    tryLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useLayoutEffect(() => {
    // The router was loading and now it's not
    if (previousIsLoading && !routerState.isLoading) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onLoad',
        fromLocation,
        toLocation,
        pathChanged,
      })

      // if (router.viewTransitionPromise) {
      //   console.log('resolving view transition promise')
      // }
      // router.viewTransitionPromise?.resolve(true)
    }
  }, [previousIsLoading, router, routerState.isLoading])

  useLayoutEffect(() => {
    // The router was pending and now it's not
    if (previousIsAnyPending && !isAnyPending) {
      const toLocation = router.state.location
      const fromLocation = router.state.resolvedLocation
      const pathChanged = fromLocation.href !== toLocation.href

      router.emit({
        type: 'onResolved',
        fromLocation,
        toLocation,
        pathChanged,
      })

      router.__store.setState((s) => ({
        ...s,
        status: 'idle',
        resolvedLocation: s.location,
      }))

      if ((document as any).querySelector) {
        if (router.state.location.hash !== '') {
          const el = document.getElementById(router.state.location.hash)
          if (el) {
            el.scrollIntoView()
          }
        }
      }
    }
  }, [isAnyPending, previousIsAnyPending, router])

  return null
}
