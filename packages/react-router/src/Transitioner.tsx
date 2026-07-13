'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'

export function Transitioner() {
  const router = useRouter()
  const mountLoadForRouter = React.useRef<
    [typeof router, typeof router.history] | undefined
  >(undefined)
  const acknowledgements = React.useRef<Array<(rendered: boolean) => void>>(
    [],
  ).current

  useLayoutEffect(() => {
    const previousTransition = router.startTransition
    const previousRendered = router._rendered
    const rendered = () => {
      for (const resolve of acknowledgements.splice(0)) {
        resolve(true)
      }
    }
    const transition = (fn: () => void) => {
      return new Promise<boolean>((resolve) => {
        acknowledgements.push(resolve)
        React.startTransition(fn)
      })
    }
    router._rendered = rendered
    router.startTransition = transition
    return () => {
      for (const resolve of acknowledgements.splice(0)) {
        resolve(false)
      }
      if (router._rendered === rendered) {
        router._rendered = previousRendered
      }
      if (router.startTransition === transition) {
        router.startTransition = previousTransition
      }
    }
  }, [acknowledgements, router])

  // Subscribe before canonicalizing so the initial URL has exactly one load.
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(router.load)

    const mounted = mountLoadForRouter.current
    if (mounted?.[0] === router && mounted[1] === router.history) {
      return unsub
    }
    mountLoadForRouter.current = [router, router.history]

    router.updateLatestLocation()
    const location = router.latestLocation
    const nextLocation = router.buildLocation({
      to: location.pathname,
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
      trimPathRight(location.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({ ...nextLocation, replace: true })
      return unsub
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === location.href &&
      resolvedLocation.state.__TSR_key === location.state.__TSR_key
    ) {
      router.emit({
        type: 'onRendered',
        ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
      })
    } else {
      router.load().catch(console.error)
    }

    return unsub
  }, [router, router.history])

  return null
}
