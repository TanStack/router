import type { ViewTransitionOptions } from '@tanstack/react-router'

/**
 * A direction-aware view transition based on PAGE ORDER, not history position.
 *
 * `__TSR_index` only tracks the history stack, so a "Previous Page" link (a
 * forward PUSH) increments it even though you're moving to an earlier page.
 * Instead we rank pages by their place in the app's sequence and slide toward
 * the later page — so the same logical move always animates the same way,
 * whether reached by a link or by browser Back/Forward.
 *
 * `types` is a FUNCTION, so it re-resolves against each navigation's from/to;
 * `replayViewTransitionOnTraversal` keeps it live by reference so Back/Forward
 * recompute the correct direction.
 */
const PAGE_ORDER = ['/', '/how-it-works', '/explore', '/posts']

/** Rank a pathname within `PAGE_ORDER` using the longest matching prefix. */
function pageRank(pathname: string): number {
  // longest matching prefix so e.g. /posts/123 ranks with /posts
  let best = -1
  let bestLen = -1
  PAGE_ORDER.forEach((p, i) => {
    const matches = p === '/' ? pathname === '/' : pathname.startsWith(p)
    if (matches && p.length > bestLen) {
      best = i
      bestLen = p.length
    }
  })
  return best
}

export const slideByDirection: ViewTransitionOptions = {
  types: ({ fromLocation, toLocation }) => {
    if (!fromLocation) {
      return ['slide-left']
    }
    const from = pageRank(fromLocation.pathname)
    const to = pageRank(toLocation.pathname)
    // Moving to a later page slides left; to an earlier page slides right.
    return [to >= from ? 'slide-left' : 'slide-right']
  },
}
