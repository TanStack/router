import * as Vue from 'vue'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

export function useTransitionerSetup() {
  const router = useRouter()
  if (isServer ?? router.isServer) {
    return
  }

  const transition = async (fn: () => void) => {
    fn()
    await Vue.nextTick()
    return true
  }
  router.startTransition = transition

  Vue.onMounted(() => {
    router.history.subscribe(router.load)

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })

    if (
      trimPathRight(router.latestLocation.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({
        ...nextLocation,
        replace: true,
        ignoreBlocker: true,
      })
      return
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === router.latestLocation.href &&
      resolvedLocation.state.__TSR_key === router.latestLocation.state.__TSR_key
    ) {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
      })
    } else if (!router._tx) {
      router.load().catch(console.error)
    }
  })
}

/** @deprecated Use useTransitionerSetup() instead. */
export const Transitioner = Vue.defineComponent({
  name: 'Transitioner',
  setup() {
    useTransitionerSetup()
    return () => null
  },
})
