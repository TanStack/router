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

  const [isTransitioning, setIsTransitioning] = Solid.createSignal(false)
  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = () =>
    isLoading() || isTransitioning() || hasPendingMatches()
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = () => isLoading() || hasPendingMatches()
  const previousIsPagePending = usePrevious(isPagePending)

  if (!router.isServer) {
    router.startTransition = async (fn: () => void | Promise<void>) => {
      setIsTransitioning(true)
      await fn()
      setIsTransitioning(false)
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
    if (router.isServer) return
    Solid.untrack(() => {
      if (
        // if we are hydrating from SSR, loading is triggered in ssr-client
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
