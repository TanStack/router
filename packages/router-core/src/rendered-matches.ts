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
