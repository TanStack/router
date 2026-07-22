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
    if (
      match.status === 'pending' &&
      match.ssr === 'data-only' &&
      match.error === undefined &&
      !match._notFound &&
      match._dataOnlyAssetEnd !== undefined
    ) {
      end = Math.min(end, Math.max(index + 1, match._dataOnlyAssetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  return end && end < matches.length ? matches.slice(0, end) : matches
}
