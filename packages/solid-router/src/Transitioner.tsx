import * as Solid from 'solid-js'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { usePrevious } from './utils'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = useRouterState({
    select: ({ isLoading }) => isLoading,
  })

  if (isServer ?? router.isServer) {
    return null
  }

  const [isSolidTransitioning, startSolidTransition] = Solid.useTransition()

  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = () =>
    isLoading() || isSolidTransitioning() || hasPendingMatches()
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = () => isLoading() || hasPendingMatches()
  const previousIsPagePending = usePrevious(isPagePending)

  router.startTransition = (fn: () => void | Promise<void>) => {
    Solid.startTransition(() => {
      startSolidTransition(fn)
    })
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

    // Check if the current URL matches the canonical form.
    // Compare publicHref (browser-facing URL) for consistency with
    // the server-side redirect check in router.beforeLoad.
    if (
      trimPathRight(router.latestLocation.publicHref) !==
      trimPathRight(nextLocation.publicHref)
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

  Solid.createComputed(
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
        if (previousIsAnyPending.previous && !isAnyPending) {
          const changeInfo = getLocationChangeInfo(router.state)
          router.emit({
            type: 'onResolved',
            ...changeInfo,
          })

          router.__store.setState((s) => ({
            ...s,
            status: 'idle',
            resolvedLocation: s.location,
          }))

          if (changeInfo.hrefChanged) {
            handleHashScroll(router)
          }
        }
      },
    ),
  )

  return null
}
