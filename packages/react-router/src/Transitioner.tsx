'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type { AnyRouteMatch } from '@tanstack/router-core'

export function Transitioner() {
  const router = useRouter()
  const acknowledgement = React.useRef<
    [Array<AnyRouteMatch>, (rendered: boolean) => void] | undefined
  >(undefined)
  const mounted =
    process.env.NODE_ENV !== 'production'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useRef(false)
      : undefined

  // `<Transitioner>` precedes `<MatchesInner>`, so install the render
  // acknowledgement before the latter can publish a rendered lane.
  router._rendered = (matches) => {
    const current = acknowledgement.current
    if (
      current?.[0].length === matches.length &&
      current[0].every(
        (match, index) =>
          match.id === matches[index]!.id &&
          match.abortController === matches[index]!.abortController &&
          match.status === matches[index]!.status,
      )
    ) {
      acknowledgement.current = undefined
      current[1](true)
    }
  }
  router.startTransition = (fn, expected, urgent) =>
    new Promise((resolve) => {
      acknowledgement.current?.[1](false)
      acknowledgement.current = [expected, resolve]
      if (urgent) {
        fn()
      } else {
        React.startTransition(fn)
      }
    })

  // Subscribe before canonicalizing so the initial URL has exactly one load.
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(router.load)

    if (mounted?.current) {
      return process.env.NODE_ENV !== 'production' ? unsub : undefined
    }
    if (mounted) {
      mounted.current = true
    }

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
    // Compare publicHref (browser-facing URL) consistently with server
    // canonicalization.
    if (
      trimPathRight(location.publicHref) !==
      trimPathRight(nextLocation.publicHref)
    ) {
      router.commitLocation({ ...nextLocation, replace: true })
      return process.env.NODE_ENV !== 'production' ? unsub : undefined
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === location.href &&
      resolvedLocation.state.__TSR_key === location.state.__TSR_key
    ) {
      acknowledgement.current = [
        router.stores.matches.get(),
        (rendered) => {
          if (rendered) {
            router.emit({
              type: 'onRendered',
              ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
            })
          }
        },
      ]
    } else if (!router._tx) {
      router.load().catch(console.error)
    }

    return process.env.NODE_ENV !== 'production' ? unsub : undefined
    // `mounted` exists only in development and is a stable ref when present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.history])

  return null
}
