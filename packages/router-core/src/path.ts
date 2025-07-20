import { last } from './utils'
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

export function joinPaths(paths: Array<string | undefined>) {
  return cleanPath(
    paths
      .filter((val) => {
        return val !== undefined
      })
      .join('/'),
  )
}

export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

export function trimPathRight(path: string) {
  return path === '/' ? path : path.replace(/\/{1,}$/, '')
}

export function trimPath(path: string) {
  return trimPathRight(trimPathLeft(path))
}

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
  basepath: string
  base: string
  to: string
  trailingSlash?: 'always' | 'never' | 'preserve'
  caseSensitive?: boolean
}

function segmentToString(segment: Segment): string {
  const { type, value } = segment
  if (type === SEGMENT_TYPE_PATHNAME) {
    return value
  }

  const { prefixSegment, suffixSegment } = segment

  if (type === SEGMENT_TYPE_PARAM) {
    const param = value.substring(1)
    if (prefixSegment && suffixSegment) {
      return `${prefixSegment}{$${param}}${suffixSegment}`
    } else if (prefixSegment) {
      return `${prefixSegment}{$${param}}`
    } else if (suffixSegment) {
      return `{$${param}}${suffixSegment}`
    }
  }

  if (type === SEGMENT_TYPE_OPTIONAL_PARAM) {
    const param = value.substring(1)
    if (prefixSegment && suffixSegment) {
      return `${prefixSegment}{-$${param}}${suffixSegment}`
    } else if (prefixSegment) {
      return `${prefixSegment}{-$${param}}`
    } else if (suffixSegment) {
      return `{-$${param}}${suffixSegment}`
    }
    return `{-$${param}}`
  }

  if (type === SEGMENT_TYPE_WILDCARD) {
    if (prefixSegment && suffixSegment) {
      return `${prefixSegment}{$}${suffixSegment}`
    } else if (prefixSegment) {
      return `${prefixSegment}{$}`
    } else if (suffixSegment) {
      return `{$}${suffixSegment}`
    }
  }

  // This case should never happen, should we throw instead?
  return value
}

export function resolvePath({
  basepath,
  base,
  to,
  trailingSlash = 'never',
  caseSensitive,
}: ResolvePathOptions) {
  base = removeBasepath(basepath, base, caseSensitive)
  to = removeBasepath(basepath, to, caseSensitive)

  let baseSegments = parsePathname(base).slice()
  const toSegments = parsePathname(to)

  if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
    baseSegments.pop()
  }

  for (let index = 0, length = toSegments.length; index < length; index++) {
    const toSegment = toSegments[index]!
    const value = toSegment.value
    if (value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment]
      } else if (index === length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment)
      } else {
        // ignore inter-slashes
      }
    } else if (value === '..') {
      baseSegments.pop()
    } else if (value === '.') {
      // ignore
    } else {
      baseSegments.push(toSegment)
    }
  }

  if (baseSegments.length > 1) {
    if (last(baseSegments)!.value === '/') {
      if (trailingSlash === 'never') {
        baseSegments.pop()
      }
    } else if (trailingSlash === 'always') {
      baseSegments.push({ type: SEGMENT_TYPE_PATHNAME, value: '/' })
    }
  }

  const segmentValues = baseSegments.map(segmentToString)
  const joined = joinPaths([basepath, ...segmentValues])
  return joined
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
export function parsePathname(pathname?: string): ReadonlyArray<Segment> {
  if (!pathname) {
    return []
  }

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
        value: part.includes('%25')
          ? part
              .split('%25')
              .map((segment) => decodeURI(segment))
              .join('%25')
          : decodeURI(part),
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
export function interpolatePath({
  path,
  params,
  leaveWildcards,
  leaveParams,
  decodeCharMap,
}: InterpolatePathOptions): InterPolatePathResult {
  const interpolatedPathSegments = parsePathname(path)

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
  const interpolatedPath = joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.type === SEGMENT_TYPE_PATHNAME) {
        return segment.value
      }

      if (segment.type === SEGMENT_TYPE_WILDCARD) {
        usedParams._splat = params._splat
        const segmentPrefix = segment.prefixSegment || ''
        const segmentSuffix = segment.suffixSegment || ''

        // Check if _splat parameter is missing
        if (!('_splat' in params)) {
          isMissingParams = true
          // For missing splat parameters, just return the prefix and suffix without the wildcard
          if (leaveWildcards) {
            return `${segmentPrefix}${segment.value}${segmentSuffix}`
          }
          // If there is a prefix or suffix, return them joined, otherwise omit the segment
          if (segmentPrefix || segmentSuffix) {
            return `${segmentPrefix}${segmentSuffix}`
          }
          return undefined
        }

        const value = encodeParam('_splat')
        if (leaveWildcards) {
          return `${segmentPrefix}${segment.value}${value ?? ''}${segmentSuffix}`
        }
        return `${segmentPrefix}${value}${segmentSuffix}`
      }

      if (segment.type === SEGMENT_TYPE_PARAM) {
        const key = segment.value.substring(1)
        if (!isMissingParams && !(key in params)) {
          isMissingParams = true
        }
        usedParams[key] = params[key]

        const segmentPrefix = segment.prefixSegment || ''
        const segmentSuffix = segment.suffixSegment || ''
        if (leaveParams) {
          const value = encodeParam(segment.value)
          return `${segmentPrefix}${segment.value}${value ?? ''}${segmentSuffix}`
        }
        return `${segmentPrefix}${encodeParam(key) ?? 'undefined'}${segmentSuffix}`
      }

      if (segment.type === SEGMENT_TYPE_OPTIONAL_PARAM) {
        const key = segment.value.substring(1)

        const segmentPrefix = segment.prefixSegment || ''
        const segmentSuffix = segment.suffixSegment || ''

        // Check if optional parameter is missing or undefined
        if (!(key in params) || params[key] == null) {
          if (leaveWildcards) {
            return `${segmentPrefix}${key}${segmentSuffix}`
          }
          // For optional params with prefix/suffix, keep the prefix/suffix but omit the param
          if (segmentPrefix || segmentSuffix) {
            return `${segmentPrefix}${segmentSuffix}`
          }
          // If no prefix/suffix, omit the entire segment
          return undefined
        }

        usedParams[key] = params[key]

        if (leaveParams) {
          const value = encodeParam(segment.value)
          return `${segmentPrefix}${segment.value}${value ?? ''}${segmentSuffix}`
        }
        return `${segmentPrefix}${encodeParam(key) ?? ''}${segmentSuffix}`
      }

      return segment.value
    }),
  )
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

export function matchPathname(
  basepath: string,
  currentPathname: string,
  matchLocation: Pick<MatchLocation, 'to' | 'fuzzy' | 'caseSensitive'>,
): AnyPathParams | undefined {
  const pathParams = matchByPath(basepath, currentPathname, matchLocation)
  // const searchMatched = matchBySearch(location.search, matchLocation)

  if (matchLocation.to && !pathParams) {
    return
  }

  return pathParams ?? {}
}

export function removeBasepath(
  basepath: string,
  pathname: string,
  caseSensitive: boolean = false,
) {
  // normalize basepath and pathname for case-insensitive comparison if needed
  const normalizedBasepath = caseSensitive ? basepath : basepath.toLowerCase()
  const normalizedPathname = caseSensitive ? pathname : pathname.toLowerCase()

  switch (true) {
    // default behaviour is to serve app from the root - pathname
    // left untouched
    case normalizedBasepath === '/':
      return pathname

    // shortcut for removing the basepath if it matches the pathname
    case normalizedPathname === normalizedBasepath:
      return ''

    // in case pathname is shorter than basepath - there is
    // nothing to remove
    case pathname.length < basepath.length:
      return pathname

    // avoid matching partial segments - strict equality handled
    // earlier, otherwise, basepath separated from pathname with
    // separator, therefore lack of separator means partial
    // segment match (`/app` should not match `/application`)
    case normalizedPathname[normalizedBasepath.length] !== '/':
      return pathname

    // remove the basepath from the pathname if it starts with it
    case normalizedPathname.startsWith(normalizedBasepath):
      return pathname.slice(basepath.length)

    // otherwise, return the pathname as is
    default:
      return pathname
  }
}

export function matchByPath(
  basepath: string,
  from: string,
  {
    to,
    fuzzy,
    caseSensitive,
  }: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
): Record<string, string> | undefined {
  // check basepath first
  if (basepath !== '/' && !from.startsWith(basepath)) {
    return undefined
  }
  // Remove the base path from the pathname
  from = removeBasepath(basepath, from, caseSensitive)
  // Default to to $ (wildcard)
  to = removeBasepath(basepath, `${to ?? '$'}`, caseSensitive)

  // Parse the from and to
  const baseSegments = parsePathname(from.startsWith('/') ? from : `/${from}`)
  const routeSegments = parsePathname(to.startsWith('/') ? to : `/${to}`)

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
