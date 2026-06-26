import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  LinkOptions,
  ParsedLocation,
  RegisteredRouter,
} from '@tanstack/router-core'

/**
 * How a target is matched against the previous history entry:
 * - `'pathname'` — match by pathname only (so going back restores the previous
 *   entry's exact search params and scroll position).
 * - `'exact'` — match by pathname **and** search.
 */
export type BackNavigationMatch = 'pathname' | 'exact'

/**
 * Decide whether navigating to `target` would land on the *previous* history
 * entry, meaning a `history.back()` is preferable to a push.
 *
 * Pure and framework-agnostic: it relies only on the router's in-memory
 * per-index entry tracking (`router.getHistoryEntry`). Returns `false` at the
 * start of history (index 0) and when the previous entry is unknown (e.g. a
 * fresh page load or deep link), so callers degrade gracefully to a normal push.
 */
export function resolveIsBackNavigation(
  router: AnyRouter,
  currentLocation: ParsedLocation,
  target: Pick<ParsedLocation, 'pathname' | 'searchStr'>,
  match: BackNavigationMatch = 'pathname',
): boolean {
  const currentIndex = currentLocation.state.__TSR_index ?? 0
  if (currentIndex === 0) return false
  const previous = router.getHistoryEntry(currentIndex - 1)
  if (!previous || previous.pathname !== target.pathname) return false
  if (match === 'exact') return previous.searchStr === target.searchStr
  return true
}

/**
 * Returns `true` when a link/navigation to the given options would resolve to
 * the *previous* history entry — i.e. clicking it should go "back" rather than
 * push a new entry.
 *
 * This is the primitive behind the `preferBack` prop on `Link`. Use it directly
 * when building custom links or buttons that want the same history-aware
 * behavior. It returns `false` on the server and falls back to `false` whenever
 * the previous entry is unknown to the router, so it is always safe to branch on.
 *
 * Pass `match: 'exact'` to also require the search to match (defaults to
 * `'pathname'`, which restores the previous entry's exact search and scroll).
 *
 * @example
 * const isBack = useIsBackNavigation({ to: '/issues' })
 * // isBack === true  -> call router.history.back()
 * // isBack === false -> navigate normally
 */
export function useIsBackNavigation<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  match: BackNavigationMatch = 'pathname',
): boolean {
  const router = useRouter()

  // On the server there is no client-side history to pop, and the previous
  // entry is never known, so back-navigation is always false.
  if (isServer ?? router.isServer) {
    return false
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static (compile-time `isServer`)
  const currentLocation = useStore(
    router.stores.location,
    (l) => l,
    (prev, next) => prev.href === next.href,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return React.useMemo(() => {
    const next = router.buildLocation({
      _fromLocation: currentLocation,
      ...options,
    } as any)
    return resolveIsBackNavigation(router, currentLocation, next, match)
  }, [router, currentLocation, options, match])
}
