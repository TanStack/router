'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'

/**
 * Bridges router-core's awaitable transition contract to React:
 *
 * 1. Core gives `startTransition` a callback that publishes to the store.
 * 2. We remember its resolver and schedule the publication with React.
 * 3. `MatchesInner` acknowledges the committed route tree from its layout effect.
 * 4. Core resumes and can finish pending timing, events, and background work.
 *
 * If another publication starts first, the older one resolves `false` because
 * it was superseded rather than rendered.
 */
export function Transitioner() {
  const router = useRouter()
  // StrictMode replays mount effects in development. This only prevents a
  // duplicate initial load/event during that replay; it is not remount state.
  const initialized =
    process.env.NODE_ENV !== 'production'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useRef(false)
      : undefined

  // React.startTransition returns void, so core waits for MatchesInner's
  // layout effect to resolve the publication after its route tree commits.
  router.startTransition = (fn) =>
    new Promise((resolve, reject) => {
      // A newer publication owns the next commit. Retire the previous one so
      // its transaction cannot report itself as rendered later.
      router._rendered?.(false)
      router._rendered = resolve
      React.startTransition(
        process.env.NODE_ENV === 'production'
          ? fn
          : () => {
              // React captures action errors. Catch inside the action so an
              // HMR failure rejects and core can roll back its publication.
              try {
                fn()
              } catch (cause) {
                router._rendered = undefined
                reject(cause)
              }
            },
      )
    })

  // Subscribe before canonicalizing so the initial URL has exactly one load.
  useLayoutEffect(() => {
    const unsub = router.history.subscribe(router.load)

    if (initialized) {
      if (initialized.current) {
        return unsub
      }
      initialized.current = true
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
      router.commitLocation({
        ...nextLocation,
        replace: true,
        ignoreBlocker: true,
      })
      return unsub
    }

    const resolvedLocation = router.stores.resolvedLocation.get()
    if (
      resolvedLocation?.href === location.href &&
      resolvedLocation.state.__TSR_key === location.state.__TSR_key
    ) {
      // Hydration or a pre-mount load may already have resolved this location.
      // Arm the same commit receipt so its first real route-tree commit emits
      // the initial onRendered event at the correct time.
      router._rendered = (rendered) => {
        if (rendered) {
          router.emit({
            type: 'onRendered',
            ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
          })
        }
      }
    } else if (!router._tx) {
      // Otherwise begin the initial load unless one is already in flight.
      router.load().catch(console.error)
    }

    return unsub
    // `initialized` exists only in development and is stable when present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, router.history])

  return null
}
