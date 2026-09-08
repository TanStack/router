import { last } from './utils'
import {
  SEGMENT_TYPE_OPTIONAL_PARAM,
  SEGMENT_TYPE_PATHNAME,
  SEGMENT_TYPE_WILDCARD,
  parseSegment,
} from './new-process-route-tree'
import type { SieveCache } from './sieve-cache'
import type { SegmentKind } from './new-process-route-tree'
import type { AnyRoute } from './route'

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

export type InterpolationPlan = [
  keys: Array<string>,
  paths: SieveCache<string | undefined, string>,
  decoder: ((encoded: string) => string) | undefined,
  path: string,
  segments: RouteInterpolation,
]

export type InterpolationSegment =
  | string
  | [
      kind: Exclude<SegmentKind, typeof SEGMENT_TYPE_PATHNAME>,
      key: string,
      prefix: string,
      /** Undefined for a bare splat, which discards the remaining template. */
      suffix: string | undefined,
    ]

export type RouteInterpolation = Array<InterpolationSegment>

export function getRouteSegments(route: AnyRoute) {
  return route._interpolation
}

function encodeParam(
  key: string,
  value: unknown,
  decoder: ((encoded: string) => string) | undefined,
): string {
  if (typeof value !== 'string') {
    return '' + (value ?? undefined)
  }

  if (key === '_splat') {
    // Early return if value only contains URL-safe characters (performance optimization)
    if (!value || /^[a-zA-Z0-9\-._~!/]*$/.test(value)) {
      return value
    }
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

/** Parse an unregistered template; registered routes are parsed with the tree. */
export function parseInterpolationPath(path: string): RouteInterpolation {
  path = cleanPath(path)
  const parts: RouteInterpolation = []
  const literalEnd = path.endsWith('/') ? path.length - 1 : path.length
  let cursor = 0
  let literalStart = 0
  let segment
  while (cursor < path.length) {
    const start = cursor
    segment = parseSegment(path, start, segment)
    const end = segment[5]
    cursor = end + 1
    const kind = segment[0]
    if (kind === SEGMENT_TYPE_PATHNAME) {
      continue
    }
    if (literalStart < start - 1) {
      parts.push(path.substring(literalStart, start - 1))
    }
    parts.push([
      kind,
      kind === SEGMENT_TYPE_WILDCARD
        ? '_splat'
        : path.substring(segment[2], segment[3]),
      '/' + path.substring(start, segment[1]),
      kind === SEGMENT_TYPE_WILDCARD && segment[2] === start
        ? undefined
        : path.substring(
            segment[4],
            kind === SEGMENT_TYPE_WILDCARD ? literalEnd : end,
          ),
    ])
    literalStart = end
  }
  if (literalStart < literalEnd) {
    parts.push(path.substring(literalStart, literalEnd))
  }
  return parts
}

/** Substitute current values into parsed segments, collecting metadata only when requested. */
export function interpolatePath(
  path: string,
  segments: RouteInterpolation,
  params: Record<string, unknown>,
  decoder?: (encoded: string) => string,
  usedParams?: Record<string, unknown>,
  metadata?: { isMissingParams: boolean },
): string {
  const trailingSlash = path.endsWith('/') ? '/' : ''
  let joined = ''
  for (const part of segments) {
    if (typeof part === 'string') {
      joined += part
      continue
    }
    const [kind, key, prefix, rawSuffix] = part
    const suffix =
      kind === SEGMENT_TYPE_WILDCARD && rawSuffix !== undefined
        ? rawSuffix + trailingSlash
        : rawSuffix
    let paramValue = params[key]

    if (kind === SEGMENT_TYPE_WILDCARD) {
      if (usedParams) {
        usedParams[key] = paramValue
        // TODO: Deprecate *
        usedParams['*'] = paramValue
      }
      if (!paramValue) {
        if (metadata) {
          metadata.isMissingParams = true
        }
        // A missing wildcard keeps its affixes, but omits a bare segment.
        if (prefix === '/' && !suffix) {
          continue
        }
        paramValue = ''
      }
    } else {
      // Named parameters: $id or {-$id}.
      if (kind === SEGMENT_TYPE_OPTIONAL_PARAM) {
        if (paramValue == null) {
          continue
        }
      } else if (metadata && !(key in params)) {
        metadata.isMissingParams = true
      }
      if (usedParams) {
        usedParams[key] = paramValue
      }
    }

    joined += prefix + encodeParam(key, paramValue, decoder) + (suffix || '')
  }

  return joined + trailingSlash || '/'
}

function encodePathParam(value: string, decoder?: (encoded: string) => string) {
  const encoded = encodeURIComponent(value)
  return decoder?.(encoded) ?? encoded
}
