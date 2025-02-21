import { last } from './utils'
import type { MatchLocation } from './RouterProvider'
import type { AnyPathParams } from './route'

export interface Segment {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
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

export function resolvePath({
  basepath,
  base,
  to,
  trailingSlash = 'never',
  caseSensitive,
}: ResolvePathOptions) {
  base = removeBasepath(basepath, base, caseSensitive)
  to = removeBasepath(basepath, to, caseSensitive)

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

  if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
    baseSegments.pop()
  }

  toSegments.forEach((toSegment, index) => {
    if (toSegment.value === '/') {
      if (!index) {
        // Leading slash
        baseSegments = [toSegment]
      } else if (index === toSegments.length - 1) {
        // Trailing Slash
        baseSegments.push(toSegment)
      } else {
        // ignore inter-slashes
      }
    } else if (toSegment.value === '..') {
      baseSegments.pop()
    } else if (toSegment.value === '.') {
      // ignore
    } else {
      baseSegments.push(toSegment)
    }
  })

  if (baseSegments.length > 1) {
    if (last(baseSegments)?.value === '/') {
      if (trailingSlash === 'never') {
        baseSegments.pop()
      }
    } else if (trailingSlash === 'always') {
      baseSegments.push({ type: 'pathname', value: '/' })
    }
  }

  const joined = joinPaths([basepath, ...baseSegments.map((d) => d.value)])
  return cleanPath(joined)
}

export function parsePathname(pathname?: string): Array<Segment> {
  if (!pathname) {
    return []
  }

  pathname = cleanPath(pathname)

  const segments: Array<Segment> = []

  if (pathname.slice(0, 1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
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
      if (part === '$' || part === '*') {
        return {
          type: 'wildcard',
          value: part,
        }
      }

      if (part.charAt(0) === '$') {
        return {
          type: 'param',
          value: part,
        }
      }

      return {
        type: 'pathname',
        value: decodeURI(part),
      }
    }),
  )

  if (pathname.slice(-1) === '/') {
    pathname = pathname.substring(1)
    segments.push({
      type: 'pathname',
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

    if (['*', '_splat'].includes(key)) {
      // the splat/catch-all routes shouldn't have the '/' encoded out
      return isValueString ? encodeURI(value) : value
    } else {
      return isValueString ? encodePathParam(value, decodeCharMap) : value
    }
  }

  const usedParams: Record<string, unknown> = {}
  const interpolatedPath = joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.type === 'wildcard') {
        usedParams._splat = params._splat
        const value = encodeParam('_splat')
        if (leaveWildcards) return `${segment.value}${value ?? ''}`
        return value
      }

      if (segment.type === 'param') {
        const key = segment.value.substring(1)
        usedParams[key] = params[key]
        if (leaveParams) {
          const value = encodeParam(segment.value)
          return `${segment.value}${value ?? ''}`
        }
        return encodeParam(key) ?? 'undefined'
      }

      return segment.value
    }),
  )
  return { usedParams, interpolatedPath }
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
  matchLocation: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
): Record<string, string> | undefined {
  // check basepath first
  if (basepath !== '/' && !from.startsWith(basepath)) {
    return undefined
  }
  // Remove the base path from the pathname
  from = removeBasepath(basepath, from, matchLocation.caseSensitive)
  // Default to to $ (wildcard)
  const to = removeBasepath(
    basepath,
    `${matchLocation.to ?? '$'}`,
    matchLocation.caseSensitive,
  )

  // Parse the from and to
  const baseSegments = parsePathname(from)
  const routeSegments = parsePathname(to)

  if (!from.startsWith('/')) {
    baseSegments.unshift({
      type: 'pathname',
      value: '/',
    })
  }

  if (!to.startsWith('/')) {
    routeSegments.unshift({
      type: 'pathname',
      value: '/',
    })
  }

  const params: Record<string, string> = {}

  const isMatch = (() => {
    for (
      let i = 0;
      i < Math.max(baseSegments.length, routeSegments.length);
      i++
    ) {
      const baseSegment = baseSegments[i]
      const routeSegment = routeSegments[i]

      const isLastBaseSegment = i >= baseSegments.length - 1
      const isLastRouteSegment = i >= routeSegments.length - 1

      if (routeSegment) {
        if (routeSegment.type === 'wildcard') {
          const _splat = decodeURI(
            joinPaths(baseSegments.slice(i).map((d) => d.value)),
          )
          // TODO: Deprecate *
          params['*'] = _splat
          params['_splat'] = _splat
          return true
        }

        if (routeSegment.type === 'pathname') {
          if (routeSegment.value === '/' && !baseSegment?.value) {
            return true
          }

          if (baseSegment) {
            if (matchLocation.caseSensitive) {
              if (routeSegment.value !== baseSegment.value) {
                return false
              }
            } else if (
              routeSegment.value.toLowerCase() !==
              baseSegment.value.toLowerCase()
            ) {
              return false
            }
          }
        }

        if (!baseSegment) {
          return false
        }

        if (routeSegment.type === 'param') {
          if (baseSegment.value === '/') {
            return false
          }
          if (baseSegment.value.charAt(0) !== '$') {
            params[routeSegment.value.substring(1)] = decodeURIComponent(
              baseSegment.value,
            )
          }
        }
      }

      if (!isLastBaseSegment && isLastRouteSegment) {
        params['**'] = joinPaths(baseSegments.slice(i + 1).map((d) => d.value))
        return !!matchLocation.fuzzy && routeSegment?.value !== '/'
      }
    }

    return true
  })()

  return isMatch ? params : undefined
}
