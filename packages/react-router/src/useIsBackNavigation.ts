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
 * Whether navigating to `target` lands on the previous history entry (so a
 * `history.back()` is preferable to a push). Returns `false` at index 0 or when
 * the previous entry is unknown, so callers degrade gracefully to a push.
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
 * Returns `true` when navigating to the given options would resolve to the
 * previous history entry — i.e. it should go "back" rather than push. The
 * primitive behind `preferBack`, for use in custom links or buttons.
 *
 * Returns `false` on the server and whenever the previous entry is unknown, so
 * it's always safe to branch on. Pass `match: 'exact'` to also require search to
 * match (defaults to `'pathname'`).
 *
 * @example
 * const isBack = useIsBackNavigation({ to: '/issues' })
 * // isBack ? router.history.back() : router.navigate({ to: '/issues' })
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
    (prev, next) =>
      prev.href === next.href &&
      prev.state.__TSR_index === next.state.__TSR_index,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const _options = React.useMemo(
    () => options,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      router,
      options.from,
      options._fromLocation,
      options.hash,
      options.to,
      options.search,
      options.params,
      options.state,
      options.mask,
      options.unsafeRelative,
    ],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return React.useMemo(() => {
    const next = router.buildLocation({
      _fromLocation: currentLocation,
      ..._options,
    } as any)
    return resolveIsBackNavigation(router, currentLocation, next, match)
  }, [router, currentLocation, _options, match])
}
