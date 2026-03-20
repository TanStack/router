import * as Solid from 'solid-js'
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = Solid.createMemo(() => router.stores.isLoading.state)

  if (isServer ?? router.isServer) {
    return null
  }

  const [isSolidTransitioning, startSolidTransition] = Solid.useTransition()

  // Track pending state changes
  const hasPendingMatches = Solid.createMemo(
    () => router.stores.hasPendingMatches.state,
  )

  const isAnyPending = Solid.createMemo(
    () => isLoading() || isSolidTransitioning() || hasPendingMatches(),
  )

  const isPagePending = Solid.createMemo(
    () => isLoading() || hasPendingMatches(),
  )

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

  Solid.createRenderEffect((previousIsLoading = false) => {
    const currentIsLoading = isLoading()

    if (previousIsLoading && !currentIsLoading) {
      router.emit({
        type: 'onLoad',
        ...getLocationChangeInfo(
          router.stores.location.state,
          router.stores.resolvedLocation.state,
        ),
      })
    }

    return currentIsLoading
  })

  Solid.createComputed((previousIsPagePending = false) => {
    const currentIsPagePending = isPagePending()

    if (previousIsPagePending && !currentIsPagePending) {
      router.emit({
        type: 'onBeforeRouteMount',
        ...getLocationChangeInfo(
          router.stores.location.state,
          router.stores.resolvedLocation.state,
        ),
      })
    }

    return currentIsPagePending
  })

  Solid.createRenderEffect((previousIsAnyPending = false) => {
    const currentIsAnyPending = isAnyPending()

    if (previousIsAnyPending && !currentIsAnyPending) {
      const changeInfo = getLocationChangeInfo(
        router.stores.location.state,
        router.stores.resolvedLocation.state,
      )
      router.emit({
        type: 'onResolved',
        ...changeInfo,
      })

      Solid.batch(() => {
        router.stores.status.setState(() => 'idle')
        router.stores.resolvedLocation.setState(
          () => router.stores.location.state,
        )
      })

      if (changeInfo.hrefChanged) {
        handleHashScroll(router)
      }
    }

    return currentIsAnyPending
  })

  return null
}
