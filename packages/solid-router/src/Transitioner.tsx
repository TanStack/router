import * as Solid from 'solid-js'
import { trimPathRight } from '@tanstack/router-core'
import { usePrevious } from './utils'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

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
    structuralSharing: true,
  })

  const previousIsLoading = usePrevious(isLoading)

  const isAnyPending = () =>
    isLoading() || isTransitioning() || hasPendingMatches()
  const isPagePending = () => isLoading() || hasPendingMatches()

  const previousIsAnyPending = usePrevious(isAnyPending)

  const previousIsPagePending = usePrevious(isPagePending)

  if (!router.isServer) {
    router.startSolidTransition = (fn: () => void) => {
      setIsTransitioning(true)
      Solid.startTransition(() => {
        fn()
        setIsTransitioning(false)
      })
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

    return () => {
      unsub()
    }
  })

  // Try to load the initial location
  Solid.createEffect(() => {
    Solid.untrack(() => {
      if (
        (typeof window !== 'undefined' && router.clientSsr) ||
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
      () => isLoading(),
      (isLoading, previousIsLoading) => {
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
      },
    ),
  )
  Solid.createRenderEffect(
    Solid.on(
      () => isPagePending(),
      (isPagePending, previousIsPagePending) => {
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
      },
    ),
  )

  Solid.createRenderEffect(
    Solid.on(
      () => isAnyPending(),
      (isAnyPending, previousIsAnyPending) => {
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

          if (
            typeof document !== 'undefined' &&
            (document as any).querySelector
          ) {
            const hashScrollIntoViewOptions =
              router.state.location.state.__hashScrollIntoViewOptions ?? true

            if (
              hashScrollIntoViewOptions &&
              router.state.location.hash !== ''
            ) {
              const el = document.getElementById(router.state.location.hash)
              if (el) {
                el.scrollIntoView(hashScrollIntoViewOptions)
              }
            }
          }
        }
      },
    ),
  )

  return null
}
