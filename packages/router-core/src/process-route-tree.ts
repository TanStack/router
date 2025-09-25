import invariant from 'tiny-invariant'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  parseRoutePathSegments,
  trimPathLeft,
  trimPathRight,
} from './path'
import type { Segment } from './path'
import type { RouteLike } from './route'

const SLASH_SCORE = 0.75
const STATIC_SEGMENT_SCORE = 1
const REQUIRED_PARAM_BASE_SCORE = 0.5
const OPTIONAL_PARAM_BASE_SCORE = 0.4
const WILDCARD_PARAM_BASE_SCORE = 0.25
const STATIC_AFTER_DYNAMIC_BONUS_SCORE = 0.2
const BOTH_PRESENCE_BASE_SCORE = 0.05
const PREFIX_PRESENCE_BASE_SCORE = 0.02
const SUFFIX_PRESENCE_BASE_SCORE = 0.01
const PREFIX_LENGTH_SCORE_MULTIPLIER = 0.0002
const SUFFIX_LENGTH_SCORE_MULTIPLIER = 0.0001

function handleParam(segment: Segment, baseScore: number) {
  if (segment.prefixSegment && segment.suffixSegment) {
    return (
      baseScore +
      BOTH_PRESENCE_BASE_SCORE +
      PREFIX_LENGTH_SCORE_MULTIPLIER * segment.prefixSegment.length +
      SUFFIX_LENGTH_SCORE_MULTIPLIER * segment.suffixSegment.length
    )
  }

  if (segment.prefixSegment) {
    return (
      baseScore +
      PREFIX_PRESENCE_BASE_SCORE +
      PREFIX_LENGTH_SCORE_MULTIPLIER * segment.prefixSegment.length
    )
  }

  if (segment.suffixSegment) {
    return (
      baseScore +
      SUFFIX_PRESENCE_BASE_SCORE +
      SUFFIX_LENGTH_SCORE_MULTIPLIER * segment.suffixSegment.length
    )
  }

  return baseScore
}

function sortRoutes<TRouteLike extends RouteLike>(
  routes: ReadonlyArray<TRouteLike>,
): Array<TRouteLike> {
  const scoredRoutes: Array<{
    child: TRouteLike
    trimmed: string
    parsed: ReadonlyArray<Segment>
    index: number
    scores: Array<number>
    hasStaticAfter: boolean
    optionalParamCount: number
  }> = []

  routes.forEach((d, i) => {
    if (d.isRoot || !d.path) {
      return
    }

    const trimmed = trimPathLeft(d.fullPath)
    let parsed = parseRoutePathSegments(trimmed)

    // Removes the leading slash if it is not the only remaining segment
    let skip = 0
    while (parsed.length > skip + 1 && parsed[skip]?.value === '/') {
      skip++
    }
    if (skip > 0) parsed = parsed.slice(skip)

    let optionalParamCount = 0
    let hasStaticAfter = false
    const scores = parsed.map((segment, index) => {
      if (segment.value === '/') {
        return SLASH_SCORE
      }

      if (segment.type === SEGMENT_TYPE_PATHNAME) {
        return STATIC_SEGMENT_SCORE
      }

      let baseScore: number | undefined = undefined
      if (segment.type === SEGMENT_TYPE_PARAM) {
        baseScore = REQUIRED_PARAM_BASE_SCORE
      } else if (segment.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
        baseScore = OPTIONAL_PARAM_BASE_SCORE
        optionalParamCount++
      } else {
        baseScore = WILDCARD_PARAM_BASE_SCORE
      }

      // if there is any static segment (that is not an index) after a required / optional param,
      // we will boost this param so it ranks higher than a required/optional param without a static segment after it
      // JUST FOR SORTING, NOT FOR MATCHING
      for (let i = index + 1; i < parsed.length; i++) {
        const nextSegment = parsed[i]!
        if (
          nextSegment.type === SEGMENT_TYPE_PATHNAME &&
          nextSegment.value !== '/'
        ) {
          hasStaticAfter = true
          return handleParam(
            segment,
            baseScore + STATIC_AFTER_DYNAMIC_BONUS_SCORE,
          )
        }
      }

      return handleParam(segment, baseScore)
    })

    scoredRoutes.push({
      child: d,
      trimmed,
      parsed,
      index: i,
      scores,
      optionalParamCount,
      hasStaticAfter,
    })
  })

  const flatRoutes = scoredRoutes
    .sort((a, b) => {
      const minLength = Math.min(a.scores.length, b.scores.length)

      // Sort by segment-by-segment score comparison ONLY for the common prefix
      for (let i = 0; i < minLength; i++) {
        if (a.scores[i] !== b.scores[i]) {
          return b.scores[i]! - a.scores[i]!
        }
      }

      // If all common segments have equal scores, then consider length and specificity
      if (a.scores.length !== b.scores.length) {
        // If different number of optional parameters, fewer optional parameters wins (more specific)
        // only if both or none of the routes has static segments after the params
        if (a.optionalParamCount !== b.optionalParamCount) {
          if (a.hasStaticAfter === b.hasStaticAfter) {
            return a.optionalParamCount - b.optionalParamCount
          } else if (a.hasStaticAfter && !b.hasStaticAfter) {
            return -1
          } else if (!a.hasStaticAfter && b.hasStaticAfter) {
            return 1
          }
        }

        // If same number of optional parameters, longer path wins (for static segments)
        return b.scores.length - a.scores.length
      }

      // Sort by min available parsed value for alphabetical ordering
      for (let i = 0; i < minLength; i++) {
        if (a.parsed[i]!.value !== b.parsed[i]!.value) {
          return a.parsed[i]!.value > b.parsed[i]!.value ? 1 : -1
        }
      }

      // Sort by original index
      return a.index - b.index
    })
    .map((d, i) => {
      d.child.rank = i
      return d.child
    })

  return flatRoutes
}

export type ProcessRouteTreeResult<TRouteLike extends RouteLike> = {
  routesById: Record<string, TRouteLike>
  routesByPath: Record<string, TRouteLike>
  flatRoutes: Array<TRouteLike>
}

export function processRouteTree<TRouteLike extends RouteLike>({
  routeTree,
  initRoute,
}: {
  routeTree: TRouteLike
  initRoute?: (route: TRouteLike, index: number) => void
}): ProcessRouteTreeResult<TRouteLike> {
  const routesById = {} as Record<string, TRouteLike>
  const routesByPath = {} as Record<string, TRouteLike>

  const recurseRoutes = (childRoutes: Array<TRouteLike>) => {
    childRoutes.forEach((childRoute, i) => {
      initRoute?.(childRoute, i)

      const existingRoute = routesById[childRoute.id]

      invariant(
        !existingRoute,
        `Duplicate routes found with id: ${String(childRoute.id)}`,
      )

      routesById[childRoute.id] = childRoute

      if (!childRoute.isRoot && childRoute.path) {
        const trimmedFullPath = trimPathRight(childRoute.fullPath)
        if (
          !routesByPath[trimmedFullPath] ||
          childRoute.fullPath.endsWith('/')
        ) {
          routesByPath[trimmedFullPath] = childRoute
        }
      }

      const children = childRoute.children as Array<TRouteLike>

      if (children?.length) {
        recurseRoutes(children)
      }
    })
  }

  recurseRoutes([routeTree])

  const flatRoutes = sortRoutes(Object.values(routesById))

  return { routesById, routesByPath, flatRoutes }
}
