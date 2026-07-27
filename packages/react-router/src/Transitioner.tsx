'use client'

import * as React from 'react'
import { getLocationChangeInfo, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type { AnyRouteMatch } from '@tanstack/router-core'

export type ReactRenderOwner = [
  offered?: Array<AnyRouteMatch>,
  settle?: (rendered: boolean) => void,
  active?: boolean,
]

export function clearOwner(
  owner: ReactRenderOwner,
  current = owner[1],
): typeof current {
  if (owner[1] === current) {
    owner[0] = owner[1] = undefined
    return current
  }
  return undefined
}

export function Transitioner({ owner }: { owner: ReactRenderOwner }) {
  const router = useRouter()

  // Subscribe before canonicalizing so the initial URL has exactly one load.
  useLayoutEffect(() => {
    // Suspense and Activity can reconnect effects without rendering again.
    const initialized = owner[2] !== undefined
    owner[2] = true
    router.startTransition = async (fn, expected) => {
      if (!owner[2]) {
        fn()
        return false
      }

      return new Promise<boolean>((resolve, reject) => {
        clearOwner(owner)?.(false)
        owner[0] = expected
        owner[1] = resolve
        if (process.env.NODE_ENV === 'production') {
          React.startTransition(fn)
        } else {
          // React captures transition-action errors, so HMR must catch inside it.
          React.startTransition(() => {
            try {
              fn()
            } catch (cause) {
              clearOwner(owner, resolve)
              reject(cause)
            }
          })
        }
      })
    }
    ;(
      router as typeof router & { _cancelTransition?: () => void }
    )._cancelTransition = () => clearOwner(owner)?.(false)
    const unsub = router.history.subscribe(router.load)

    if (
      !initialized ||
      router.history.location.state.__TSR_key !==
        router.latestLocation.state.__TSR_key
    ) {
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
      } else {
        const resolvedLocation = router.stores.resolvedLocation.get()
        if (
          resolvedLocation?.href === location.href &&
          resolvedLocation.state.__TSR_key === location.state.__TSR_key
        ) {
          if (!owner[1]) {
            owner[0] = router.stores.matches.get()
            owner[1] = (rendered) => {
              if (rendered) {
                router.emit({
                  type: 'onRendered',
                  ...getLocationChangeInfo(resolvedLocation, resolvedLocation),
                })
              }
            }
          }
        } else if (initialized || !router._tx) {
          router.load().catch(console.error)
        }
      }
    }

    return () => {
      unsub()
      owner[2] = false
      if (process.env.NODE_ENV === 'production') {
        clearOwner(owner)?.(false)
      } else {
        const current = owner[1]
        // StrictMode replays effects without another render. Its second setup
        // reactivates this owner before the microtask; a real unmount does not.
        queueMicrotask(() => {
          if (!owner[2]) {
            clearOwner(owner, current)?.(false)
          }
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, router, router.history])

  return null
}
