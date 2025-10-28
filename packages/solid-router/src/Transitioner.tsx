import * as Solid from 'solid-js'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { usePrevious } from './utils'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = useRouterState({
    select: ({ isLoading }) => isLoading,
  })

  if (router.isServer) {
    return null
  }

  const [isTransitioning, setIsTransitioning] = Solid.createSignal(false)
  const [isPending, solidStartTransition] = Solid.useTransition()
  const [isNavigating, setIsNavigating] = Solid.createSignal(false)

  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = () =>
    isLoading() || isTransitioning() || hasPendingMatches() || isPending()
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = () => isLoading() || hasPendingMatches()
  const previousIsPagePending = usePrevious(isPagePending)

  // Combined transition state - checks multiple sources:
  // - isTransitioning: set when startTransition is called
  // - isPending: from Solid's useTransition
  // - isNavigating: set before history updates to catch early signal changes
  const isInTransition = () => isTransitioning() || isPending() || isNavigating()

  // Store the transition state accessor on the router so it can be accessed
  router.isTransitioning = isInTransition

  // Set up hook to be called before history updates
  router.onBeforeHistoryUpdate = () => {
    setIsNavigating(true)
  }

  router.startTransition = (fn: () => void | Promise<void>) => {
    setIsTransitioning(true)
    try {
      // Execute the function and handle promise if it's async
      const result = fn()
      if (result instanceof Promise) {
        result.finally(() => {
          setIsTransitioning(false)
        })
      } else {
        setIsTransitioning(false)
      }
    } catch (err) {
      setIsTransitioning(false)
      throw err
    }
  }

  // Subscribe to location changes
  // and try to load the new location
  Solid.onMount(() => {
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

    Solid.onCleanup(() => {
      unsub()
    })
  })

  // Try to load the initial location
  Solid.createRenderEffect(() => {
    Solid.untrack(() => {
      if (
        // if we are hydrating from SSR and already have matches, loading was triggered in ssr-client
        (typeof window !== 'undefined' && router.ssr && router.state.matches.length > 0) ||
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
  })

  Solid.createRenderEffect(
    Solid.on(
      [previousIsLoading, isLoading],
      ([previousIsLoading, isLoading]) => {
        if (previousIsLoading.previous && !isLoading) {
          router.emit({
            type: 'onLoad',
            ...getLocationChangeInfo(router.state),
          })
        }
      },
    ),
  )

  Solid.createRenderEffect(
    Solid.on(
      [isPagePending, previousIsPagePending],
      ([isPagePending, previousIsPagePending]) => {
        // emit onBeforeRouteMount
        if (previousIsPagePending.previous && !isPagePending) {
          router.emit({
            type: 'onBeforeRouteMount',
            ...getLocationChangeInfo(router.state),
          })
        }
      },
    ),
  )

  // Track isPending changes to reset isNavigating when transition completes
  const previousIsPending = usePrevious(isPending)
  Solid.createRenderEffect(
    Solid.on(
      [isPending, previousIsPending],
      ([isPending, previousIsPending]) => {
        // Reset isNavigating when Solid's transition completes
        // This ensures we wait for all resources to finish loading
        if (previousIsPending.previous && !isPending) {
          setIsNavigating(false)
        }
      },
    ),
  )

  Solid.createRenderEffect(
    Solid.on(
      [isAnyPending, previousIsAnyPending],
      ([isAnyPending, previousIsAnyPending]) => {
        // The router was pending and now it's not
        if (previousIsAnyPending.previous && !isAnyPending) {
          router.emit({
            type: 'onResolved',
            ...getLocationChangeInfo(router.state),
          })

          router.__store.setState((s) => ({
            ...s,
            status: 'idle',
            resolvedLocation: s.location,
          }))

          handleHashScroll(router)
        }
      },
    ),
  )

  return null
}
