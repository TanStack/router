import { last } from './utils'
import type { MatchLocation } from './RouterProvider'
import type { AnyPathParams } from './route'

export interface Segment {
  type: 'pathname' | 'param' | 'wildcard'
  value: string
}

export function joinPaths(paths: Array<string | undefined>) {
  return cleanPath(paths.filter(Boolean).join('/'))
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

export function resolvePath(basepath: string, base: string, to: string) {
  base = base.replace(new RegExp(`^${basepath}`), '/')
  to = to.replace(new RegExp(`^${basepath}`), '/')

  let baseSegments = parsePathname(base)
  const toSegments = parsePathname(to)

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
      // Extra trailing slash? pop it off
      if (baseSegments.length > 1 && last(baseSegments)?.value === '/') {
        baseSegments.pop()
      }
      baseSegments.pop()
    } else if (toSegment.value === '.') {
      return
    } else {
      baseSegments.push(toSegment)
    }
  })

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
        value: part,
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
  params: any
  leaveWildcards?: boolean
  leaveParams?: boolean
}
export function interpolatePath({
  path,
  params,
  leaveWildcards,
  leaveParams,
}: InterpolatePathOptions) {
  const interpolatedPathSegments = parsePathname(path)

  return joinPaths(
    interpolatedPathSegments.map((segment) => {
      if (segment.type === 'wildcard') {
        const value = params._splat
        if (leaveWildcards) return `${segment.value}${value ?? ''}`
        return value
      }

      if (segment.type === 'param') {
        if (leaveParams) {
          const value = params[segment.value]
          return `${segment.value}${value ?? ''}`
        }
        return params![segment.value.substring(1)] ?? 'undefined'
      }

      return segment.value
    }),
  )
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

export function removeBasepath(basepath: string, pathname: string) {
  return basepath != '/' ? pathname.replace(basepath, '') : pathname
}

export function matchByPath(
  basepath: string,
  from: string,
  matchLocation: Pick<MatchLocation, 'to' | 'caseSensitive' | 'fuzzy'>,
): Record<string, string> | undefined {
  // Remove the base path from the pathname
  from = removeBasepath(basepath, from)
  // Default to to $ (wildcard)
  const to = removeBasepath(basepath, `${matchLocation.to ?? '$'}`)

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
          if (baseSegment?.value) {
            const _splat = decodeURI(
              joinPaths(baseSegments.slice(i).map((d) => d.value)),
            )
            // TODO: Deprecate *
            params['*'] = _splat
            params['_splat'] = _splat
            return true
          }
          return false
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
            params[routeSegment.value.substring(1)] = decodeURI(
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
