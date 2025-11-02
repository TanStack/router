import { decodePathSegment, last } from './utils'
import { parseSegment } from "./new-process-route-tree"
import type { SegmentKind } from "./new-process-route-tree"
import type { LRUCache } from './lru-cache'
import type { MatchLocation } from './RouterProvider'
import type { AnyPathParams } from './route'

export const SEGMENT_TYPE_PATHNAME = 0
export const SEGMENT_TYPE_PARAM = 1
export const SEGMENT_TYPE_WILDCARD = 2
export const SEGMENT_TYPE_OPTIONAL_PARAM = 3

export interface Segment {
  readonly type:
  | typeof SEGMENT_TYPE_PATHNAME
  | typeof SEGMENT_TYPE_PARAM
  | typeof SEGMENT_TYPE_WILDCARD
  | typeof SEGMENT_TYPE_OPTIONAL_PARAM
  readonly value: string
  readonly prefixSegment?: string
  readonly suffixSegment?: string
  // Indicates if there is a static segment after this required/optional param
  readonly hasStaticAfter?: boolean
}

/** Join path segments, cleaning duplicate slashes between parts. */
/** Join path segments, cleaning duplicate slashes between parts. */
export function joinPaths(paths: Array<string | undefined>) {
  return cleanPath(
    paths
      .filter((val) => {
        return val !== undefined
      })
      .join('/'),
  )
}

/** Remove repeated slashes from a path string. */
/** Remove repeated slashes from a path string. */
export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

/** Trim leading slashes (except preserving root '/'). */
/** Trim leading slashes (except preserving root '/'). */
export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

/** Trim trailing slashes (except preserving root '/'). */
/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

/** Trim both leading and trailing slashes. */
/** Trim both leading and trailing slashes. */
export function trimPath(path: string) {
  return trimPathRight(trimPathLeft(path))
}

/** Remove a trailing slash from value when appropriate for comparisons. */
export function removeTrailingSlash(value: string, basepath: string): string {
  if (value?.endsWith('/') && value !== '/' && value !== `${basepath}/`) {
    return value.slice(0, -1)
  }
  return value
}

// intended to only compare path name
// see the usage in the isActive under useLinkProps
// /sample/path1 = /sample/path1/
// /sample/path1/some <> /sample/path1
/**
 * Compare two pathnames for exact equality after normalizing trailing slashes
 * relative to the provided `basepath`.
 */
/**
 * Compare two pathnames for exact equality after normalizing trailing slashes
 * relative to the provided `basepath`.
 */
export function exactPathTest(
  pathName1: string,
  pathName2: string,
  basepath: string,
): boolean {
  return (
    removeTrailingSlash(pathName1, basepath) ===
    removeTrailingSlash(pathName2, basepath)
  )
}

// When resolving relative paths, we treat all paths as if they are trailing slash
// documents. All trailing slashes are removed after the path is resolved.
// Here are a few examples:
//
// /a/b/c + ./d = /a/b/c/d
// /a/b/c + ../d = /a/b/d
// /a/b/c + ./d/ = /a/b/c/d
// /a/b/c + ../d/ = /a/b/d
// /a/b/c + ./ = /a/b/c
//
// Absolute paths that start with `/` short circuit the resolution process to the root
// path.
//
// Here are some examples:
//
// /a/b/c + /d = /d
// /a/b/c + /d/ = /d
// /a/b/c + / = /
//
// Non-.-prefixed paths are still treated as relative paths, resolved like `./`
//
// Here are some examples:
//
// /a/b/c + d = /a/b/c/d
// /a/b/c + d/ = /a/b/c/d
// /a/b/c + d/e = /a/b/c/d/e
interface ResolvePathOptions {
  base: string
  to: string
  trailingSlash?: 'always' | 'never' | 'preserve'
}

/**
 * Resolve a destination path against a base, honoring trailing-slash policy
 * and supporting relative segments (`.`/`..`) and absolute `to` values.
 */
export function resolvePath({
  base,
  to,
  trailingSlash = 'never',
}: ResolvePathOptions) {
  let baseSegments = base.split('/')
  const toSegments = to.split('/')

  if (baseSegments.length > 1 && last(baseSegments) === '') {
    baseSegments.pop()
  }

  for (let index = 0, length = toSegments.length; index < length; index++) {
    const value = toSegments[index]!
    if (value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [value]
      } else if (index === length - 1) {
        // Trailing Slash
        baseSegments.push(value)
      } else {
        // ignore inter-slashes
      }
    } else if (value === '..') {
      baseSegments.pop()
    } else if (value === '.') {
      // ignore
    } else {
      baseSegments.push(value)
    }
  }

  if (baseSegments.length > 1) {
    if (last(baseSegments) === '') {
      if (trailingSlash === 'never') {
        baseSegments.pop()
      }
    } else if (trailingSlash === 'always') {
      baseSegments.push('')
    }
  }

  const data = new Uint16Array(6)
  const segmentValues = baseSegments.map((segment) => {
    if (!segment) return ''
    parseSegment(segment, 0, data)
    const kind = data[0] as SegmentKind
    if (kind === SEGMENT_TYPE_PATHNAME) {
      return segment
    }
    const end = data[5]!
    const prefix = segment.substring(0, data[1])
    const suffix = segment.substring(data[4]!, end)
    const value = segment.substring(data[2]!, data[3])
    if (kind === SEGMENT_TYPE_PARAM) {
      return prefix || suffix ? `${prefix}{$${value}}${suffix}` : `$${value}`
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      return prefix || suffix ? `${prefix}{$}${suffix}` : '$'
    } else { // SEGMENT_TYPE_OPTIONAL_PARAM
      return `${prefix}{-$${value}}${suffix}`
    }
  })
  const joined = joinPaths(segmentValues)
  return joined || '/'
}

export type ParsePathnameCache = LRUCache<string, ReadonlyArray<Segment>>

/**
 * Parse a pathname into an array of typed segments used by the router's
 * matcher. Results are optionally cached via an LRU cache.
 */
/**
 * Parse a pathname into an array of typed segments used by the router's
 * matcher. Results are optionally cached via an LRU cache.
 */
export const parsePathname = (
  pathname?: string,
  cache?: ParsePathnameCache,
): ReadonlyArray<Segment> => {
  if (!pathname) return []
  const cached = cache?.get(pathname)
  if (cached) return cached
  const parsed = baseParsePathname(pathname)
  cache?.set(pathname, parsed)
  return parsed
}

const PARAM_RE = /^\$.{1,}$/ // $paramName
const PARAM_W_CURLY_BRACES_RE = /^(.*?)\{(\$[a-zA-Z_$][a-zA-Z0-9_$]*)\}(.*)$/ // prefix{$paramName}suffix
const OPTIONAL_PARAM_W_CURLY_BRACES_RE =
  /^(.*?)\{-(\$[a-zA-Z_$][a-zA-Z0-9_$]*)\}(.*)$/ // prefix{-$paramName}suffix

const WILDCARD_RE = /^\$$/ // $
const WILDCARD_W_CURLY_BRACES_RE = /^(.*?)\{\$\}(.*)$/ // prefix{$}suffix

/**
 * Required: `/foo/$bar` ✅
 * Prefix and Suffix: `/foo/prefix${bar}suffix` ✅
 * Wildcard: `/foo/$` ✅
 * Wildcard with Prefix and Suffix: `/foo/prefix{$}suffix` ✅
 *
 * Optional param: `/foo/{-$bar}`
 * Optional param with Prefix and Suffix: `/foo/prefix{-$bar}suffix`

 * Future:
 * Optional named segment: `/foo/{bar}`
 * Optional named segment with Prefix and Suffix: `/foo/prefix{-bar}suffix`
 * Escape special characters:
 * - `/foo/[$]` - Static route
 * - `/foo/[$]{$foo} - Dynamic route with a static prefix of `$`
 * - `/foo/{$foo}[$]` - Dynamic route with a static suffix of `$`
 */
function baseParsePathname(pathname: string): ReadonlyArray<Segment> {
  pathname = cleanPath(pathname)

  const segments: Array<Segment> = []

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: SEGMENT_TYPE_PATHNAME,
      value: '/',
    })
  }

  if (!pathname) {
    return segments
  }

  // Remove empty segments and '.' segments
  const split = pathname.split('/').filter(Boolean)

  segments.push(
    ...split.map((part): Segment => {
      // Check for wildcard with curly braces: prefix{$}suffix
      const wildcardBracesMatch = part.match(WILDCARD_W_CURLY_BRACES_RE)
      if (wildcardBracesMatch) {
        const prefix = wildcardBracesMatch[1]
        const suffix = wildcardBracesMatch[2]
        return {
          type: SEGMENT_TYPE_WILDCARD,
          value: '$',
          prefixSegment: prefix || undefined,
          suffixSegment: suffix || undefined,
        }
      }

      // Check for optional parameter format: prefix{-$paramName}suffix
      const optionalParamBracesMatch = part.match(
        OPTIONAL_PARAM_W_CURLY_BRACES_RE,
      )
      if (optionalParamBracesMatch) {
        const prefix = optionalParamBracesMatch[1]
        const paramName = optionalParamBracesMatch[2]!
        const suffix = optionalParamBracesMatch[3]
        return {
          type: SEGMENT_TYPE_OPTIONAL_PARAM,
          value: paramName, // Now just $paramName (no prefix)
          prefixSegment: prefix || undefined,
          suffixSegment: suffix || undefined,
        }
      }

      // Check for the new parameter format: prefix{$paramName}suffix
      const paramBracesMatch = part.match(PARAM_W_CURLY_BRACES_RE)
      if (paramBracesMatch) {
        const prefix = paramBracesMatch[1]
        const paramName = paramBracesMatch[2]
        const suffix = paramBracesMatch[3]
        return {
          type: SEGMENT_TYPE_PARAM,
          value: '' + paramName,
          prefixSegment: prefix || undefined,
          suffixSegment: suffix || undefined,
        }
      }

      // Check for bare parameter format: $paramName (without curly braces)
      if (PARAM_RE.test(part)) {
        const paramName = part.substring(1)
        return {
          type: SEGMENT_TYPE_PARAM,
          value: '$' + paramName,
          prefixSegment: undefined,
          suffixSegment: undefined,
        }
      }

      // Check for bare wildcard: $ (without curly braces)
      if (WILDCARD_RE.test(part)) {
        return {
          type: SEGMENT_TYPE_WILDCARD,
          value: '$',
          prefixSegment: undefined,
          suffixSegment: undefined,
        }
      }

      // Handle regular pathname segment
      return {
        type: SEGMENT_TYPE_PATHNAME,
        value: decodePathSegment(part),
      }
    }),
  )

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: SEGMENT_TYPE_PATHNAME,
      value: '/',
    })
  }

  return segments
}

interface InterpolatePathOptions {
  path?: string
  params: Record<string, unknown>
  leaveWildcards?: boolean
  leaveParams?: boolean
  // Map of encoded chars to decoded chars (e.g. '%40' -> '@') that should remain decoded in path params
  decodeCharMap?: Map<string, string>
}

type InterPolatePathResult = {
  interpolatedPath: string
  usedParams: Record<string, unknown>
  isMissingParams: boolean // true if any params were not available when being looked up in the params object
}
/**
 * Interpolate params and wildcards into a route path template.
 *
 * - Encodes params safely (configurable allowed characters)
 * - Supports `{-$optional}` segments, `{prefix{$id}suffix}` and `{$}` wildcards
 * - Optionally leaves placeholders or wildcards in place
 */
/**
 * Interpolate params and wildcards into a route path template.
 * Encodes safely and supports optional params and custom decode char maps.
 */
export function interpolatePath({
  path,
  params,
  leaveWildcards,
  leaveParams,
  decodeCharMap,
}: InterpolatePathOptions): InterPolatePathResult {
  if (!path) return { interpolatedPath: '/', usedParams: {}, isMissingParams: false }

  function encodeParam(key: string): any {
    const value = params[key]
    const isValueString = typeof value === 'string'

    if (key === '*' || key === '_splat') {
      // the splat/catch-all routes shouldn't have the '/' encoded out
      return isValueString ? encodeURI(value) : value
    } else {
      return isValueString ? encodePathParam(value, decodeCharMap) : value
    }
  }

  // Tracking if any params are missing in the `params` object
  // when interpolating the path
  let isMissingParams = false
  const usedParams: Record<string, unknown> = {}
  let cursor = 0
  const data = new Uint16Array(6)
  const length = path.length
  const interpolatedSegments: Array<string> = []
  while (cursor < length) {
    const start = cursor
    parseSegment(path, start, data)
    const end = data[5]!
    cursor = end + 1
    const kind = data[0] as SegmentKind

    if (kind === SEGMENT_TYPE_PATHNAME) {
      interpolatedSegments.push(path.substring(start, end))
      continue
    }

    if (kind === SEGMENT_TYPE_WILDCARD) {
      usedParams._splat = params._splat

      // TODO: Deprecate *
      usedParams['*'] = params._splat

      const prefix = path.substring(start, data[1])
      const suffix = path.substring(data[4]!, end)

      // Check if _splat parameter is missing. _splat could be missing if undefined or an empty string or some other falsy value.
      if (!params._splat) {
        isMissingParams = true
        // For missing splat parameters, just return the prefix and suffix without the wildcard
        // If there is a prefix or suffix, return them joined, otherwise omit the segment
        if (prefix || suffix) {
          if (leaveWildcards) {
            interpolatedSegments.push(`${prefix}{$}${suffix}`)
          } else {
            interpolatedSegments.push(`${prefix}${suffix}`)
          }
        }
        continue
      }

      const value = encodeParam('_splat')
      if (leaveWildcards) {
        interpolatedSegments.push(`${prefix}${prefix || suffix ? '{$}' : '$'}${value ?? ''}${suffix}`)
      } else {
        interpolatedSegments.push(`${prefix}${value}${suffix}`)
      }
      continue
    }

    if (kind === SEGMENT_TYPE_PARAM) {
      const key = path.substring(data[2]!, data[3])
      if (!isMissingParams && !(key in params)) {
        isMissingParams = true
      }
      usedParams[key] = params[key]

      const prefix = path.substring(start, data[1])
      const suffix = path.substring(data[4]!, end)
      if (leaveParams) {
        const value = encodeParam(key)
        interpolatedSegments.push(`${prefix}$${key}${value ?? ''}${suffix}`)
      } else {
        interpolatedSegments.push(`${prefix}${encodeParam(key) ?? 'undefined'}${suffix}`)
      }
      continue
    }

    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const key = path.substring(data[2]!, data[3])

      const prefix = path.substring(start, data[1])
      const suffix = path.substring(data[4]!, end)

      // Check if optional parameter is missing or undefined
      if (!(key in params) || params[key] == null) {
        if (leaveWildcards) {
          interpolatedSegments.push(`${prefix}${key}${suffix}`)
        } else if (prefix || suffix) {
          // For optional params with prefix/suffix, keep the prefix/suffix but omit the param
          interpolatedSegments.push(`${prefix}${suffix}`)
        }
        // If no prefix/suffix, omit the entire segment
        continue
      }

      usedParams[key] = params[key]

      const value = encodeParam(key) ?? ''
      if (leaveParams) {
        interpolatedSegments.push(`${prefix}${key}${value}${suffix}`)
      } else if (leaveWildcards) {
        interpolatedSegments.push(`${prefix}${key}${value}${suffix}`)
      } else {
        interpolatedSegments.push(`${prefix}${value}${suffix}`)
      }
      continue
    }
  }

  const interpolatedPath = joinPaths(interpolatedSegments) || '/'

  return { usedParams, interpolatedPath, isMissingParams }
}

function encodePathParam(value: string, decodeCharMap?: Map<string, string>) {
  let encoded = encodeURIComponent(value)
  if (decodeCharMap) {
    for (const [encodedChar, char] of decodeCharMap) {
      encoded = encoded.replaceAll(encodedChar, char)
    }
  }
  return encoded
}

/**
 * Match a pathname against a route destination and return extracted params
 * or `undefined`. Uses the same parsing as the router for consistency.
 */
/**
 * Match a pathname against a route destination and return extracted params
 * or `undefined`. Uses the same parsing as the router for consistency.
 */
export function matchPathname(
  currentPathname: string,
  matchLocation: Pick<MatchLocation, 'to' | 'fuzzy' | 'caseSensitive'>,
  parseCache?: ParsePathnameCache,
): AnyPathParams | undefined {
  const pathParams = matchByPath(currentPathname, matchLocation, parseCache)
  // const searchMatched = matchBySearch(location.search, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  return pathParams ?? {}
}

/** Low-level matcher that compares two path strings and extracts params. */
/** Low-level matcher that compares two path strings and extracts params. */
export function matchByPath(
  from: string,
  {
    to,
    fuzzy,
    caseSensitive,
  }: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
  parseCache?: ParsePathnameCache,
): Record<string, string> | undefined {
  const stringTo = to as string

  // Parse the from and to
  const baseSegments = parsePathname(
    from.startsWith('/') ? from : `/${from}`,
    parseCache,
  )
  const routeSegments = parsePathname(
    stringTo.startsWith('/') ? stringTo : `/${stringTo}`,
    parseCache,
  )

  const params: Record<string, string> = {}

  const result = isMatch(
    baseSegments,
    routeSegments,
    params,
    fuzzy,
    caseSensitive,
  )

  return result ? params : undefined
}

function isMatch(
  baseSegments: ReadonlyArray<Segment>,
  routeSegments: ReadonlyArray<Segment>,
  params: Record<string, string>,
  fuzzy?: boolean,
  caseSensitive?: boolean,
): boolean {
  let baseIndex = 0
  let routeIndex = 0

  while (baseIndex < baseSegments.length || routeIndex < routeSegments.length) {
    const baseSegment = baseSegments[baseIndex]
    const routeSegment = routeSegments[routeIndex]

    if (routeSegment) {
      if (routeSegment.type === SEGMENT_TYPE_WILDCARD) {
        // Capture all remaining segments for a wildcard
        const remainingBaseSegments = baseSegments.slice(baseIndex)

        let _splat: string

        // If this is a wildcard with prefix/suffix, we need to handle the first segment specially
        if (routeSegment.prefixSegment || routeSegment.suffixSegment) {
          if (!baseSegment) return false

          const prefix = routeSegment.prefixSegment || ''
          const suffix = routeSegment.suffixSegment || ''

          // Check if the base segment starts with prefix and ends with suffix
          const baseValue = baseSegment.value
          if ('prefixSegment' in routeSegment) {
            if (!baseValue.startsWith(prefix)) {
              return false
            }
          }
          if ('suffixSegment' in routeSegment) {
            if (
              !baseSegments[baseSegments.length - 1]?.value.endsWith(suffix)
            ) {
              return false
            }
          }

          let rejoinedSplat = decodeURI(
            joinPaths(remainingBaseSegments.map((d) => d.value)),
          )

          // Remove the prefix and suffix from the rejoined splat
          if (prefix && rejoinedSplat.startsWith(prefix)) {
            rejoinedSplat = rejoinedSplat.slice(prefix.length)
          }

          if (suffix && rejoinedSplat.endsWith(suffix)) {
            rejoinedSplat = rejoinedSplat.slice(
              0,
              rejoinedSplat.length - suffix.length,
            )
          }

          _splat = rejoinedSplat
        } else {
          // If no prefix/suffix, just rejoin the remaining segments
          _splat = decodeURI(
            joinPaths(remainingBaseSegments.map((d) => d.value)),
          )
        }

        // TODO: Deprecate *
        params['*'] = _splat
        params['_splat'] = _splat
        return true
      }

      if (routeSegment.type === SEGMENT_TYPE_PATHNAME) {
        if (routeSegment.value === '/' && !baseSegment?.value) {
          routeIndex++
          continue
        }

        if (baseSegment) {
          if (caseSensitive) {
            if (routeSegment.value !== baseSegment.value) {
              return false
            }
          } else if (
            routeSegment.value.toLowerCase() !== baseSegment.value.toLowerCase()
          ) {
            return false
          }
          baseIndex++
          routeIndex++
          continue
        } else {
          return false
        }
      }

      if (routeSegment.type === SEGMENT_TYPE_PARAM) {
        if (!baseSegment) {
          return false
        }

        if (baseSegment.value === '/') {
          return false
        }

        let _paramValue = ''
        let matched = false

        // If this param has prefix/suffix, we need to extract the actual parameter value
        if (routeSegment.prefixSegment || routeSegment.suffixSegment) {
          const prefix = routeSegment.prefixSegment || ''
          const suffix = routeSegment.suffixSegment || ''

          // Check if the base segment starts with prefix and ends with suffix
          const baseValue = baseSegment.value
          if (prefix && !baseValue.startsWith(prefix)) {
            return false
          }
          if (suffix && !baseValue.endsWith(suffix)) {
            return false
          }

          let paramValue = baseValue
          if (prefix && paramValue.startsWith(prefix)) {
            paramValue = paramValue.slice(prefix.length)
          }
          if (suffix && paramValue.endsWith(suffix)) {
            paramValue = paramValue.slice(0, paramValue.length - suffix.length)
          }

          _paramValue = decodeURIComponent(paramValue)
          matched = true
        } else {
          // If no prefix/suffix, just decode the base segment value
          _paramValue = decodeURIComponent(baseSegment.value)
          matched = true
        }

        if (matched) {
          params[routeSegment.value.substring(1)] = _paramValue
          baseIndex++
        }

        routeIndex++
        continue
      }

      if (routeSegment.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
        // Optional parameters can be missing - don't fail the match
        if (!baseSegment) {
          // No base segment for optional param - skip this route segment
          routeIndex++
          continue
        }

        if (baseSegment.value === '/') {
          // Skip slash segments for optional params
          routeIndex++
          continue
        }

        let _paramValue = ''
        let matched = false

        // If this optional param has prefix/suffix, we need to extract the actual parameter value
        if (routeSegment.prefixSegment || routeSegment.suffixSegment) {
          const prefix = routeSegment.prefixSegment || ''
          const suffix = routeSegment.suffixSegment || ''

          // Check if the base segment starts with prefix and ends with suffix
          const baseValue = baseSegment.value
          if (
            (!prefix || baseValue.startsWith(prefix)) &&
            (!suffix || baseValue.endsWith(suffix))
          ) {
            let paramValue = baseValue
            if (prefix && paramValue.startsWith(prefix)) {
              paramValue = paramValue.slice(prefix.length)
            }
            if (suffix && paramValue.endsWith(suffix)) {
              paramValue = paramValue.slice(
                0,
                paramValue.length - suffix.length,
              )
            }

            _paramValue = decodeURIComponent(paramValue)
            matched = true
          }
        } else {
          // For optional params without prefix/suffix, we need to check if the current
          // base segment should match this optional param or a later route segment

          // Look ahead to see if there's a later route segment that matches the current base segment
          let shouldMatchOptional = true
          for (
            let lookAhead = routeIndex + 1;
            lookAhead < routeSegments.length;
            lookAhead++
          ) {
            const futureRouteSegment = routeSegments[lookAhead]
            if (
              futureRouteSegment?.type === SEGMENT_TYPE_PATHNAME &&
              futureRouteSegment.value === baseSegment.value
            ) {
              // The current base segment matches a future pathname segment,
              // so we should skip this optional parameter
              shouldMatchOptional = false
              break
            }

            // If we encounter a required param or wildcard, stop looking ahead
            if (
              futureRouteSegment?.type === SEGMENT_TYPE_PARAM ||
              futureRouteSegment?.type === SEGMENT_TYPE_WILDCARD
            ) {
              if (baseSegments.length < routeSegments.length) {
                shouldMatchOptional = false
              }
              break
            }
          }

          if (shouldMatchOptional) {
            // If no prefix/suffix, just decode the base segment value
            _paramValue = decodeURIComponent(baseSegment.value)
            matched = true
          }
        }

        if (matched) {
          params[routeSegment.value.substring(1)] = _paramValue
          baseIndex++
        }

        routeIndex++
        continue
      }
    }

    // If we have base segments left but no route segments, it's a fuzzy match
    if (baseIndex < baseSegments.length && routeIndex >= routeSegments.length) {
      params['**'] = joinPaths(
        baseSegments.slice(baseIndex).map((d) => d.value),
      )
      return !!fuzzy && routeSegments[routeSegments.length - 1]?.value !== '/'
    }

    // If we have route segments left but no base segments, check if remaining are optional
    if (routeIndex < routeSegments.length && baseIndex >= baseSegments.length) {
      // Check if all remaining route segments are optional
      for (let i = routeIndex; i < routeSegments.length; i++) {
        if (routeSegments[i]?.type !== SEGMENT_TYPE_OPTIONAL_PARAM) {
          return false
        }
      }
      // All remaining are optional, so we can finish
      break
    }

    break
  }

  return true
}
