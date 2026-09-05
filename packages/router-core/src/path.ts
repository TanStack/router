import { isServer } from '@tanstack/router-core/isServer'
import { last } from './utils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './new-process-route-tree'
import type { SieveCache } from './sieve-cache'

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
export function cleanPath(path: string) {
  // remove double slashes
  return path.replace(/\/{2,}/g, '/')
}

/** Trim leading slashes (except preserving root '/'). */
export function trimPathLeft(path: string) {
  return path === '/' ? path : path.replace(/^\/{1,}/, '')
}

/** Trim trailing slashes (except preserving root '/'). */
export function trimPathRight(path: string) {
  const len = path.length
  return len > 1 && path[len - 1] === '/' ? path.replace(/\/{1,}$/, '') : path
}

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
  cache?: SieveCache<string, string>
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
  if (to.includes('//')) {
    to = cleanPath(to)
  }

  if (to.startsWith('/')) {
    if (to.length === 1 || trailingSlash === 'preserve') {
      return to
    }
    if (trailingSlash === 'always') {
      return to.endsWith('/') ? to : `${to}/`
    }
    return to.endsWith('/') ? to.slice(0, -1) : to
  }

  const isBase = to === '.'
  let key
  if (cache) {
    // `trailingSlash` is static per router, so it doesn't need to be part of the cache key
    key = isBase ? base : base + '\0' + to
    const cached = cache.get(key)
    if (cached) return cached
  }

  let baseSegments: Array<string>
  if (isBase) {
    baseSegments = base.split('/')
  } else {
    if (base.includes('//')) {
      base = cleanPath(base)
    }
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
        if (baseSegments.length > 1) {
          baseSegments.pop()
        } else {
          baseSegments = ['']
        }
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

  const joined = baseSegments.join('/')
  const result = (isBase ? cleanPath(joined) : joined) || '/'
  if (key && cache) cache.set(key, result)
  return result
}

/**
 * Create a pre-compiled decode config from allowed characters.
 * This should be called once at router initialization.
 */
export function compileDecodeCharMap(
  pathParamsAllowedCharacters: ReadonlyArray<string>,
) {
  const charMap = new Map(
    pathParamsAllowedCharacters.map((char) => [encodeURIComponent(char), char]),
  )
  // Escape special regex characters and join with |
  const pattern = Array.from(charMap.keys())
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(pattern, 'g')
  return (encoded: string) =>
    encoded.replace(regex, (match) => charMap.get(match) ?? match)
}

interface InterpolatePathOptions {
  path?: string
  params: Record<string, unknown>
  /**
   * A function that decodes a path parameter value.
   * Obtained from `compileDecodeCharMap(pathParamsAllowedCharacters)`.
   */
  decoder?: (encoded: string) => string
  /**
   * @internal
   * For testing only, in development mode we use the router.isServer value
   */
  server?: boolean
}

type InterPolatePathResult = {
  interpolatedPath: string
  usedParams: Record<string, unknown>
  isMissingParams: boolean // true if any params were not available when being looked up in the params object
}

function encodeParam(
  key: string,
  value: unknown,
  decoder: InterpolatePathOptions['decoder'],
): string {
  if (typeof value !== 'string') {
    return '' + (value ?? undefined)
  }

  if (key === '_splat') {
    // Early return if value only contains URL-safe characters (performance optimization)
    if (/^[a-zA-Z0-9\-._~!/]*$/.test(value)) return value
    // the splat/catch-all routes shouldn't have the '/' encoded out
    // Use encodeURIComponent for each segment to properly encode spaces,
    // plus signs, and other special characters that encodeURI leaves unencoded
    return value
      .split('/')
      .map((segment) => encodePathParam(segment, decoder))
      .join('/')
  } else {
    return encodePathParam(value, decoder)
  }
}

/**
 * Interpolate params and wildcards into a route path template.
 *
 * - Encodes params safely (configurable allowed characters)
 * - Supports `{-$optional}` segments, `{prefix{$id}suffix}` and `{$}` wildcards
 */
export function interpolatePath(
  options: InterpolatePathOptions,
): InterPolatePathResult {
  const { path, params, decoder, server } = options
  const usedParams: Record<string, unknown> = Object.create(null)
  let isMissingParams = false
  const interpolatedPath = interpolatePathname(
    path || '/',
    params,
    decoder,
    usedParams,
    undefined,
    server,
    () => {
      isMissingParams = true
    },
  )
  return { interpolatedPath, usedParams, isMissingParams }
}

/**
 * @internal
 * Optional metadata is collected in the same pass as the pathname.
 */
export function interpolatePathname(
  path: string,
  params: Record<string, unknown>,
  decoder: InterpolatePathOptions['decoder'],
  usedParams?: Record<string, unknown>,
  keys?: Array<string>,
  server?: boolean,
  onMissing?: () => void,
): string {
  if (!path.includes('$')) {
    return path
  }

  if (isServer ?? server) {
    // Fast path for common templates like `/posts/$id` or `/files/$`.
    // Braced segments (`{...}`) are more complex (prefix/suffix/optional) and are
    // handled by the general parser below.
    if (path.indexOf('{') === -1) {
      const length = path.length
      let cursor = 0
      let joined = ''

      while (cursor < length) {
        // Skip slashes between segments. '/' code is 47
        while (cursor < length && path.charCodeAt(cursor) === 47) {
          cursor++
        }
        if (cursor >= length) {
          break
        }

        const start = cursor
        let end = path.indexOf('/', cursor)
        if (end === -1) {
          end = length
        }
        cursor = end

        const part = path.substring(start, end)

        // `$id` or `$` (splat). '$' code is 36
        if (part.charCodeAt(0) === 36) {
          const splat = part.length === 1
          const key = splat ? '_splat' : part.substring(1)
          const value = params[key]
          keys?.push(key)
          if (onMissing && !(splat ? value : key in params)) {
            onMissing()
            onMissing = undefined
          }
          if (usedParams) {
            usedParams[key] = value
            if (splat) {
              // TODO: Deprecate *
              usedParams['*'] = value
            }
          }
          if (!splat || value) {
            joined += '/' + encodeParam(key, value, decoder)
          }
        } else {
          joined += '/' + part
        }
      }

      if (path.endsWith('/')) {
        joined += '/'
      }

      return joined || '/'
    }
  }

  let cursor = 0
  let segment
  let joined = ''
  while (cursor < path.length) {
    const start = cursor
    segment = parseSegment(path, start, segment)
    const end = segment[5]
    cursor = end + 1

    if (start === end) {
      continue
    }

    const kind = segment[0]

    if (kind === SEGMENT_TYPE_PATHNAME) {
      joined += '/' + path.substring(start, end)
      continue
    }

    const splat = kind === SEGMENT_TYPE_WILDCARD
    const optional = kind === SEGMENT_TYPE_OPTIONAL_PARAM
    const key = splat ? '_splat' : path.substring(segment[2], segment[3])
    const valueRaw = params[key]
    keys?.push(key)
    if (onMissing && !(splat ? valueRaw : optional || key in params)) {
      onMissing()
      onMissing = undefined
    }
    if (optional && valueRaw == null) {
      continue
    }
    if (usedParams) {
      usedParams[key] = valueRaw
      if (splat) {
        // TODO: Deprecate *
        usedParams['*'] = valueRaw
      }
    }

    const prefix = path.substring(start, segment[1])
    const suffix = path.substring(segment[4], end)
    const emptySplat = splat && !valueRaw
    if (emptySplat && !prefix && !suffix) {
      continue
    }
    const value = emptySplat ? '' : encodeParam(key, valueRaw, decoder)
    joined += '/' + prefix + value + suffix
  }

  if (path.endsWith('/')) {
    joined += '/'
  }

  return joined || '/'
}

function encodePathParam(
  value: string,
  decoder?: InterpolatePathOptions['decoder'],
) {
  const encoded = encodeURIComponent(value)
  return decoder?.(encoded) ?? encoded
}
