/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import {
  getLocationChangeInfo,
  handleHashScroll,
  trimPathRight,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { subscribeStore } from './subscribe'
import type { Handle } from '@remix-run/ui'

const isClient = typeof document !== 'undefined'

/**
 * Drives router transitions: subscribes to history, fires lifecycle events,
 * commits resolved locations, and handles hash-scroll on completion.
 *
 * Mirrors the React binding's `<Transitioner>`, but uses closure-tracked
 * "previous" values and `handle.queueTask` instead of `useEffect` /
 * `useLayoutEffect`.
 */
export function Transitioner(handle: Handle) {
  const router = useRouter(handle)

  // We deliberately do NOT override `router.startTransition`.
  //
  // In React, `React.startTransition` defers updates so the UI stays
  // responsive while the router resolves a new match. `remix/ui`'s
  // scheduler is already non-blocking — every `handle.update()` is queued
  // and processed off the event loop — so the React-side trick has no
  // analogue. Leaving the default `(fn) => fn()` from router-core in
  // place is correct.

  const readIsLoading = subscribeStore(handle, router.stores.isLoading)
  const readHasPending = subscribeStore(handle, router.stores.hasPending)

  let prevIsLoading = readIsLoading()
  let prevIsPagePending = prevIsLoading || readHasPending()
  let prevIsAnyPending = prevIsPagePending

  // Subscribe to history changes; re-load on URL change.
  const unsubHistory = router.history.subscribe(() => router.load())
  handle.signal.addEventListener('abort', unsubHistory, { once: true })

  // Reconcile canonical URL on mount (mirrors React `useEffect`).
  handle.queueTask(() => {
    const next = router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    } as any)
    if (
      trimPathRight(router.latestLocation.publicHref) !==
      trimPathRight(next.publicHref)
    ) {
      router.commitLocation({ ...next, replace: true } as any)
    }
  })

  // Initial load (skip if hydrating from SSR).
  let mounted = false
  handle.queueTask(async () => {
    if (mounted) return
    mounted = true
    if (isClient && router.ssr) return
    try {
      await router.load()
    } catch (err) {
      console.error(err)
    }
  })

  return () => {
    const isLoading = readIsLoading()
    const hasPending = readHasPending()
    const isPagePending = isLoading || hasPending
    const isAnyPending = isPagePending

    if (prevIsLoading && !isLoading) {
      router.emit({
        type: 'onLoad',
        ...getLocationChangeInfo(
          router.stores.location.get(),
          router.stores.resolvedLocation.get(),
        ),
      })
    }
    if (prevIsPagePending && !isPagePending) {
      router.emit({
        type: 'onBeforeRouteMount',
        ...getLocationChangeInfo(
          router.stores.location.get(),
          router.stores.resolvedLocation.get(),
        ),
      })
    }
    if (prevIsAnyPending && !isAnyPending) {
      const changeInfo = getLocationChangeInfo(
        router.stores.location.get(),
        router.stores.resolvedLocation.get(),
      )
      router.emit({ type: 'onResolved', ...changeInfo })
      router.stores.status.set('idle')
      router.stores.resolvedLocation.set(router.stores.location.get())
      if (changeInfo.hrefChanged) handleHashScroll(router)
    }

    prevIsLoading = isLoading
    prevIsPagePending = isPagePending
    prevIsAnyPending = isAnyPending
    return null
  }
}
