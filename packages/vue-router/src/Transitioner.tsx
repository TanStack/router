import * as Vue from 'vue'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import { usePrevious } from './utils'

export function Transitioner() {
  const router = useRouter()
  let mountLoadForRouter = { router, mounted: false }
  const isLoading = useRouterState({
    select: ({ isLoading }) => isLoading,
  })

  const isTransitioning = Vue.ref(false)
  // Track pending state changes
  const hasPendingMatches = useRouterState({
    select: (s) => s.matches.some((d) => d.status === 'pending'),
  })

  const previousIsLoading = usePrevious(()=>isLoading.value)

  const isAnyPending = () =>
    isLoading.value || isTransitioning.value || hasPendingMatches.value
  const previousIsAnyPending = usePrevious(isAnyPending)

  const isPagePending = () => isLoading.value || hasPendingMatches.value
  const previousIsPagePending = usePrevious(isPagePending)

  if (!router.isServer) {
    router.startTransition = (fn: () => void) => {
      isTransitioning.value = true
      fn()
      isTransitioning.value = false
    }
  }

  // Subscribe to location changes
  // and try to load the new location
  Vue.onMounted(() => {
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

    Vue.onUnmounted(() => {
      unsub()
    })
  })

  // Try to load the initial location
  Vue.effect(() => {
    () => {
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
    }
  })

  Vue.effect(
    () => {
      if (previousIsLoading.value.previous && !isLoading.value) {
        router.emit({
          type: 'onLoad',
          ...getLocationChangeInfo(router.state),
        })
      }
    }
  )
  Vue.effect(
    () => {
        // emit onBeforeRouteMount
        if (previousIsPagePending.value.previous && !isPagePending()) {
          router.emit({
            type: 'onBeforeRouteMount',
            ...getLocationChangeInfo(router.state),
          })
        }
      },
    
  )

  Vue.effect(
      () => {
        // The router was pending and now it's not
        if (previousIsAnyPending.value.previous && !isAnyPending()) {
          router.emit({
            type: 'onResolved',
            ...getLocationChangeInfo(router.state),
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
    
  )

  return null
}
