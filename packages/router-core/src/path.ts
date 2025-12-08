import { last } from './utils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './new-process-route-tree'
import type { LRUCache } from './lru-cache'

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
  const len = path.length
  return len > 1 && path[len - 1] === '/' ? path.replace(/\/{1,}$/, '') : path
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
  cache?: LRUCache<string, string>
}

/**
 * Resolve a destination path against a base, honoring trailing-slash policy
 * and supporting relative segments (`.`/`..`) and absolute `to` values.
 */
export function resolvePath({
  base,
  to,
  trailingSlash = 'never',
  cache,
}: ResolvePathOptions) {
  const isAbsolute = to.startsWith('/')
  const isBase = !isAbsolute && to === '.'

  let key
  if (cache) {
    // `trailingSlash` is static per router, so it doesn't need to be part of the cache key
    key = isAbsolute ? to : isBase ? base : base + '\0' + to
    const cached = cache.get(key)
    if (cached) return cached
  }

  let baseSegments: Array<string>
  if (isBase) {
    baseSegments = base.split('/')
  } else if (isAbsolute) {
    baseSegments = to.split('/')
  } else {
    baseSegments = base.split('/')
    while (baseSegments.length > 1 && last(baseSegments) === '') {
      baseSegments.pop()
    }

    const toSegments = to.split('/')
    for (let index = 0, length = toSegments.length; index < length; index++) {
      const value = toSegments[index]!
      if (value === '') {
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

  let segment
  let joined = ''
  for (let i = 0; i < baseSegments.length; i++) {
    if (i > 0) joined += '/'
    const part = baseSegments[i]!
    if (!part) continue
    segment = parseSegment(part, 0, segment)
    const kind = segment[0]
    if (kind === SEGMENT_TYPE_PATHNAME) {
      joined += part
      continue
    }
    const end = segment[5]
    const prefix = part.substring(0, segment[1])
    const suffix = part.substring(segment[4], end)
    const value = part.substring(segment[2], segment[3])
    if (kind === SEGMENT_TYPE_PARAM) {
      joined += prefix || suffix ? `${prefix}{$${value}}${suffix}` : `$${value}`
    } else if (kind === SEGMENT_TYPE_WILDCARD) {
      joined += prefix || suffix ? `${prefix}{$}${suffix}` : '$'
    } else {
      // SEGMENT_TYPE_OPTIONAL_PARAM
      joined += `${prefix}{-$${value}}${suffix}`
    }
  }
  joined = cleanPath(joined)
  const result = joined || '/'
  if (key && cache) cache.set(key, result)
  return result
}

interface InterpolatePathOptions {
  path?: string
  params: Record<string, unknown>
  // Map of encoded chars to decoded chars (e.g. '%40' -> '@') that should remain decoded in path params
  decodeCharMap?: Map<string, string>
}

type InterPolatePathResult = {
  interpolatedPath: string
  usedParams: Record<string, unknown>
  isMissingParams: boolean // true if any params were not available when being looked up in the params object
}

function encodeParam(
  key: string,
  params: InterpolatePathOptions['params'],
  decodeCharMap: InterpolatePathOptions['decodeCharMap'],
): any {
  const value = params[key]
  if (typeof value !== 'string') return value

  if (key === '_splat') {
    // the splat/catch-all routes shouldn't have the '/' encoded out
    return encodeURI(value)
  } else {
    return encodePathParam(value, decodeCharMap)
  }
}

/**
 * Interpolate params and wildcards into a route path template.
 *
 * - Encodes params safely (configurable allowed characters)
 * - Supports `{-$optional}` segments, `{prefix{$id}suffix}` and `{$}` wildcards
 */
/**
 * Interpolate params and wildcards into a route path template.
 * Encodes safely and supports optional params and custom decode char maps.
 */
export function interpolatePath({
  path,
  params,
  decodeCharMap,
}: InterpolatePathOptions): InterPolatePathResult {
  // Tracking if any params are missing in the `params` object
  // when interpolating the path
  let isMissingParams = false
  const usedParams: Record<string, unknown> = {}

  if (!path || path === '/')
    return { interpolatedPath: '/', usedParams, isMissingParams }
  if (!path.includes('$'))
    return { interpolatedPath: path, usedParams, isMissingParams }

  const length = path.length
  let cursor = 0
  let segment
  let joined = ''
  while (cursor < length) {
    const start = cursor
    segment = parseSegment(path, start, segment)
    const end = segment[5]
    cursor = end + 1

    if (start === end) continue

    const kind = segment[0]

    if (kind === SEGMENT_TYPE_PATHNAME) {
      joined += '/' + path.substring(start, end)
      continue
    }

    if (kind === SEGMENT_TYPE_WILDCARD) {
      const splat = params._splat
      usedParams._splat = splat
      // TODO: Deprecate *
      usedParams['*'] = splat

      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)

      // Check if _splat parameter is missing. _splat could be missing if undefined or an empty string or some other falsy value.
      if (!splat) {
        isMissingParams = true
        // For missing splat parameters, just return the prefix and suffix without the wildcard
        // If there is a prefix or suffix, return them joined, otherwise omit the segment
        if (prefix || suffix) {
          joined += '/' + prefix + suffix
        }
        continue
      }

      const value = encodeParam('_splat', params, decodeCharMap)
      joined += '/' + prefix + value + suffix
      continue
    }

    if (kind === SEGMENT_TYPE_PARAM) {
      const key = path.substring(segment[2], segment[3])
      if (!isMissingParams && !(key in params)) {
        isMissingParams = true
      }
      usedParams[key] = params[key]

      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)
      const value = encodeParam(key, params, decodeCharMap) ?? 'undefined'
      joined += '/' + prefix + value + suffix
      continue
    }

    if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
      const key = path.substring(segment[2], segment[3])
      const valueRaw = params[key]

      // Check if optional parameter is missing or undefined
      if (valueRaw == null) continue

      usedParams[key] = valueRaw

      const prefix = path.substring(start, segment[1])
      const suffix = path.substring(segment[4], end)
      const value = encodeParam(key, params, decodeCharMap) ?? ''
      joined += '/' + prefix + value + suffix
      continue
    }
  }

  if (path.endsWith('/')) joined += '/'

  const interpolatedPath = joined || '/'

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
