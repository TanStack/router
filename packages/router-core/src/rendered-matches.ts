import type { AnyRouteMatch } from './Matches'

/** Return the structural lane through the first terminal render boundary. */
export function _getRenderedMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  const end =
    matches.findIndex(
      (match) => match.status !== 'success' || match._notFound,
    ) + 1
  return end && end < matches.length ? matches.slice(0, end) : matches
}

/** Return the lane whose document assets belong to the current presentation. */
export function _getAssetMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  let end = matches.length
  for (let index = 0; index < end; index++) {
    const match = matches[index]!
    // `_assetEnd` is only ever set on hydration presentation clones that are
    // `status: 'pending'`, `ssr: 'data-only'`, error-free, and not not-found
    // (see hydrate.ts), and commits clear it — so its presence alone is the guard.
    if (match._assetEnd !== undefined) {
      end = Math.min(end, Math.max(index + 1, match._assetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  // `end` only ever shrinks to `index + 1 >= 1`, so no zero guard is needed.
  return end < matches.length ? matches.slice(0, end) : matches
}
