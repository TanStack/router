import { isServer } from '@tanstack/router-core/isServer'
import type { RouteIds } from './routeInfo'
import type { AnyRouter } from './router'

export type Awaitable<T> = T | Promise<T>
export type NoInfer<T> = [T][T extends any ? 0 : never]
export type IsAny<TValue, TYesResult, TNoResult = TValue> = 1 extends 0 & TValue
  ? TYesResult
  : TNoResult

export type PickAsRequired<TValue, TKey extends keyof TValue> = Omit<
  TValue,
  TKey
> &
  Required<Pick<TValue, TKey>>

export type PickRequired<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
}

export type PickOptional<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K]
}

// from https://stackoverflow.com/a/76458160
export type WithoutEmpty<T> = T extends any ? ({} extends T ? never : T) : never

export type Expand<T> = T extends object
  ? T extends infer O
    ? O extends Function
      ? O
      : { [K in keyof O]: O[K] }
    : never
  : T

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>
    }
  : T

export type MakeDifferenceOptional<TLeft, TRight> = keyof TLeft &
  keyof TRight extends never
  ? TRight
  : Omit<TRight, keyof TLeft & keyof TRight> & {
      [K in keyof TLeft & keyof TRight]?: TRight[K]
    }

// from https://stackoverflow.com/a/53955431
// eslint-disable-next-line @typescript-eslint/naming-convention
export type IsUnion<T, U extends T = T> = (
  T extends any ? (U extends T ? false : true) : never
) extends false
  ? false
  : true

export type IsNonEmptyObject<T> = T extends object
  ? keyof T extends never
    ? false
    : true
  : false

export type Assign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : keyof TLeft & keyof TRight extends never
          ? TLeft & TRight
          : Omit<TLeft, keyof TRight> & TRight
    : never
  : never

export type IntersectAssign<TLeft, TRight> = TLeft extends any
  ? TRight extends any
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : TRight & TLeft
    : never
  : never

export type Timeout = ReturnType<typeof setTimeout>

export type Updater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev?: TPrevious) => TResult)

export type NonNullableUpdater<TPrevious, TResult = TPrevious> =
  | TResult
  | ((prev: TPrevious) => TResult)

export type ExtractObjects<TUnion> = TUnion extends MergeAllPrimitive
  ? never
  : TUnion

export type PartialMergeAllObject<TUnion> =
  ExtractObjects<TUnion> extends infer TObj
    ? [TObj] extends [never]
      ? never
      : {
          [TKey in TObj extends any ? keyof TObj : never]?: TObj extends any
            ? TKey extends keyof TObj
              ? TObj[TKey]
              : never
            : never
        }
    : never

export type MergeAllPrimitive =
  | ReadonlyArray<any>
  | number
  | string
  | bigint
  | boolean
  | symbol
  | undefined
  | null

export type ExtractPrimitives<TUnion> = TUnion extends MergeAllPrimitive
  ? TUnion
  : TUnion extends object
    ? never
    : TUnion

export type PartialMergeAll<TUnion> =
  | ExtractPrimitives<TUnion>
  | PartialMergeAllObject<TUnion>

export type Constrain<T, TConstraint, TDefault = TConstraint> =
  | (T extends TConstraint ? T : never)
  | TDefault

export type ConstrainLiteral<T, TConstraint, TDefault = TConstraint> =
  | (T & TConstraint)
  | TDefault

/**
 * To be added to router types
 */
export type UnionToIntersection<T> = (
  T extends any ? (arg: T) => any : never
) extends (arg: infer T) => any
  ? T
  : never

/**
 * Merges everything in a union into one object.
 * This mapped type is homomorphic which means it preserves stuff! :)
 */
export type MergeAllObjects<
  TUnion,
  TIntersected = UnionToIntersection<ExtractObjects<TUnion>>,
> = [keyof TIntersected] extends [never]
  ? never
  : {
      [TKey in keyof TIntersected]: TUnion extends any
        ? TUnion[TKey & keyof TUnion]
        : never
    }

export type MergeAll<TUnion> =
  | MergeAllObjects<TUnion>
  | ExtractPrimitives<TUnion>

export type ValidateJSON<T> = ((...args: Array<any>) => any) extends T
  ? unknown extends T
    ? never
    : 'Function is not serializable'
  : { [K in keyof T]: ValidateJSON<T[K]> }

export type LooseReturnType<T> = T extends (
  ...args: Array<any>
) => infer TReturn
  ? TReturn
  : never

export type LooseAsyncReturnType<T> = T extends (
  ...args: Array<any>
) => infer TReturn
  ? TReturn extends Promise<infer TReturn>
    ? TReturn
    : TReturn
  : never

/**
 * Return the last element of an array.
 * Intended for non-empty arrays used within router internals.
 */
export function last<T>(arr: ReadonlyArray<T>) {
  return arr[arr.length - 1]
}

/**
 * Apply a value-or-updater to a previous value.
 * Accepts either a literal value or a function of the previous value.
 */
export function functionalUpdate<TPrevious, TResult = TPrevious>(
  updater: Updater<TPrevious, TResult> | NonNullableUpdater<TPrevious, TResult>,
  previous: TPrevious,
): TResult {
  if (typeof updater === 'function') {
    return (updater as Function)(previous)
  }

  return updater
}

export const hasOwn = Object.prototype.hasOwnProperty

export function hasKeys(obj: Record<string, unknown>) {
  for (const key in obj) {
    if (hasOwn.call(obj, key)) return true
  }
  return false
}

export const createNull = () => Object.create(null)
// Search and params objects use null prototypes so keys like `__proto__` stay data.
export const nullReplaceEqualDeep: typeof replaceEqualDeep = (prev, next) =>
  replaceEqualDeep(prev, next, true)

/**
 * Returns `prev` when the supported values are deeply equal; otherwise copies
 * `next` with its equal children shared from `prev`.
 * This can be used for structural sharing between immutable JSON values for example.
 * Own `__proto__` keys are unsupported when copying ordinary objects.
 * Do not use this with signals
 */
export function replaceEqualDeep<T>(
  prev: any,
  next: T,
  _nullProto?: boolean,
  _depth = 0,
): T {
  if (isServer) {
    return next
  }
  if (prev === next) {
    return prev
  }
  if (_depth > 500) {
    return next
  }

  const value = next as any
  const array = Array.isArray(value)
  if (
    array ? !Array.isArray(prev) : !isPlainObject(prev) || !isPlainObject(value)
  ) {
    return next
  }

  const previousKeys = Object.keys(prev)
  const keys = Object.keys(value)
  const count = keys.length
  if (array) {
    // Reject holes and extra enumerable string keys before using indices.
    if (
      previousKeys.length !== prev.length ||
      count !== value.length ||
      (previousKeys.length > 0 &&
        previousKeys[previousKeys.length - 1] !== String(prev.length - 1)) ||
      (count > 0 && keys[count - 1] !== String(count - 1))
    ) {
      return next
    }
  } else if (
    previousKeys.length !== Object.getOwnPropertyNames(prev).length ||
    count !== Object.getOwnPropertyNames(value).length ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return next
  }

  let equal = previousKeys.length === count
  // The key lists are private scratch space. Arrays reuse next's exact-size
  // list as their result; objects keep next's keys and overwrite prev's list
  // with resolved children after each ownership check.
  const children: Array<any> = array ? keys : previousKeys
  if (array) {
    // An identical array needs no child resolution or buffer writes. If an
    // entry differs, copy the known-identical prefix directly from prev.
    let start = 0
    if (equal) {
      while (start < count && prev[start] === value[start]) {
        start++
      }
      if (start === count) {
        return prev
      }
    }
    // Filling lets numeric results use packed numeric storage in V8.
    if (count > 0 && typeof value[0] === 'number') {
      children.fill(0)
    }
    for (let index = 0; index < start; index++) {
      children[index] = prev[index]
    }
    for (let index = start; index < count; index++) {
      const previous = prev[index]
      const incoming = value[index]
      const child =
        previous === incoming
          ? previous
          : typeof previous === 'object'
            ? replaceEqualDeep(previous, incoming, _nullProto, _depth + 1)
            : incoming
      children[index] = child
      if (child !== previous) {
        equal = false
      }
    }
    return (equal ? prev : children) as T
  }

  for (let index = 0; index < count; index++) {
    const key = keys[index]!
    const previous = prev[key]
    const incoming = value[key]
    const child =
      previous === incoming
        ? previous
        : typeof previous === 'object'
          ? replaceEqualDeep(previous, incoming, _nullProto, _depth + 1)
          : incoming
    if (
      equal &&
      (child !== previous ||
        (previousKeys[index] !== key && !hasOwn.call(prev, key)))
    ) {
      equal = false
    }
    children[index] = child
  }
  if (equal) {
    return Object.getOwnPropertySymbols(prev).length ? next : prev
  }
  const result = _nullProto ? Object.create(null) : {}
  for (let index = 0; index < count; index++) {
    result[keys[index]!] = children[index]
  }
  return result
}

export function isPlainObject(o: unknown): boolean {
  if (!o || typeof o !== 'object') {
    return false
  }
  // An own constructor is data and cannot identify the object's prototype.
  if (o.constructor === Object && !hasOwn.call(o, 'constructor')) {
    return true
  }
  const proto = Object.getPrototypeOf(o)
  return proto === null || proto.constructor === Object
}

/**
 * Check if a value is a "plain" array (no extra enumerable keys).
 */
export function isPlainArray(value: unknown): value is Array<unknown> {
  return Array.isArray(value) && value.length === Object.keys(value).length
}

/**
 * Perform a deep equality check with options for partial comparison and
 * ignoring `undefined` values. Optimized for router state comparisons.
 */
export function deepEqual(
  a: any,
  b: any,
  opts?: { partial?: boolean; ignoreUndefined?: boolean },
): boolean {
  if (a === b) {
    return true
  }

  if (typeof a !== typeof b) {
    return false
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0, l = a.length; i < l; i++) {
      if (!deepEqual(a[i], b[i], opts)) return false
    }
    return true
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const ignoreUndefined = opts?.ignoreUndefined ?? true

    if (opts?.partial) {
      for (const k in b) {
        if (!ignoreUndefined || b[k] !== undefined) {
          if (!deepEqual(a[k], b[k], opts)) return false
        }
      }
      return true
    }

    let aCount = 0
    if (!ignoreUndefined) {
      aCount = Object.keys(a).length
    } else {
      for (const k in a) {
        if (a[k] !== undefined) aCount++
      }
    }

    let bCount = 0
    for (const k in b) {
      if (!ignoreUndefined || b[k] !== undefined) {
        bCount++
        if (bCount > aCount || !deepEqual(a[k], b[k], opts)) return false
      }
    }

    return aCount === bCount
  }

  return false
}

export type StringLiteral<T> = T extends string
  ? string extends T
    ? string
    : T
  : never

export type ThrowOrOptional<T, TThrow extends boolean> = TThrow extends true
  ? T
  : T | undefined

export type StrictOrFrom<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean = true,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
    }
  : {
      from: ConstrainLiteral<TFrom, RouteIds<TRouter['routeTree']>>
      strict?: TStrict
    }

export type ThrowConstraint<
  TStrict extends boolean,
  TThrow extends boolean,
> = TStrict extends false ? (TThrow extends true ? never : TThrow) : TThrow

export type ControlledPromise<T> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value: any) => void
  status: 'pending' | 'resolved' | 'rejected'
  value?: T
}

/**
 * Create a promise with exposed resolve/reject and status fields.
 * Useful for coordinating async router lifecycle operations.
 */
export function createControlledPromise<T>(onResolve?: (value: T) => void) {
  let resolveLoadPromise!: (value: T) => void
  let rejectLoadPromise!: (value: any) => void

  const controlledPromise = new Promise<T>((resolve, reject) => {
    resolveLoadPromise = resolve
    rejectLoadPromise = reject
  }) as ControlledPromise<T>

  controlledPromise.status = 'pending'

  controlledPromise.resolve = (value: T) => {
    controlledPromise.status = 'resolved'
    controlledPromise.value = value
    resolveLoadPromise(value)
    onResolve?.(value)
  }

  controlledPromise.reject = (e) => {
    controlledPromise.status = 'rejected'
    rejectLoadPromise(e)
  }

  return controlledPromise
}

/**
 * Heuristically detect dynamic import "module not found" errors
 * across major browsers for lazy route component handling.
 */
export function isModuleNotFoundError(error: any): boolean {
  // chrome: "Failed to fetch dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // firefox: "error loading dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // safari: "Importing a module script failed."
  if (typeof error?.message !== 'string') return false
  return (
    error.message.startsWith('Failed to fetch dynamically imported module') ||
    error.message.startsWith('error loading dynamically imported module') ||
    error.message.startsWith('Importing a module script failed')
  )
}

export function isPromise<T>(
  value: Promise<Awaited<T>> | T,
): value is Promise<Awaited<T>> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Promise<T>).then === 'function',
  )
}

export function findLast<T>(
  array: ReadonlyArray<T>,
  predicate: (item: T) => boolean,
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    const item = array[i]!
    if (predicate(item)) return item
  }
  return undefined
}

/**
 * Re-encode characters that are unsafe in URL paths.
 * Includes ASCII control characters (0x00-0x1F, 0x7F) and a subset of the
 * WHATWG URL "path percent-encode set" (", <, >, `, {, }).
 *
 * Space (0x20) is intentionally excluded — decodeURI decodes %20 to space
 * and the router stores decoded spaces in location.pathname. The existing
 * encodePathLikeUrl already handles re-encoding spaces for outgoing URLs.
 *
 * These characters are decoded by decodeURI but must remain percent-encoded
 * in paths to match how upstream layers (CDNs, edge middleware, browsers)
 * interpret the URL, preventing infinite redirect loops and path mismatches.
 */
// eslint-disable-next-line no-control-regex
const PATH_UNSAFE_RE = /[\x00-\x1f\x7f"<>`{}]/g

function sanitizePathSegment(segment: string): string {
  return segment.replace(
    PATH_UNSAFE_RE,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  )
}

function decodeSegment(segment: string): string {
  let decoded: string
  try {
    decoded = decodeURI(segment)
  } catch {
    // if the decoding fails, try to decode the various parts leaving the malformed tags in place
    decoded = segment.replaceAll(/%[0-9A-F]{2}/gi, (match) => {
      try {
        return decodeURI(match)
      } catch {
        return match
      }
    })
  }
  return sanitizePathSegment(decoded)
}

/**
 * Default list of URL protocols to allow in links, redirects, and navigation.
 * Any absolute URL protocol not in this list is treated as dangerous by default.
 */
export const DEFAULT_PROTOCOL_ALLOWLIST = [
  // Standard web navigation
  'http:',
  'https:',

  // Common browser-safe actions
  'mailto:',
  'tel:',
]

/**
 * Extract the explicit URL scheme, including its colon, using WHATWG
 * normalization rules. This does not validate the rest of the URL.
 *
 * Returning `undefined` means "no explicit scheme", not "safe URL";
 * protocol-relative URLs such as "//evil.example" require a separate check.
 */
export function getUrlScheme(url: string): string | undefined {
  if (url[0] === '/') {
    return undefined
  }
  if (!url.includes(':')) {
    return undefined
  }
  // WHATWG strips leading C0/space and TAB/LF/CR within a scheme.
  // Match the prefix first so relative paths and URL bodies need no copying.
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x20]*([a-z][a-z\d+.\t\n\r-]*:)/i
    .exec(url)?.[1]
    ?.replace(/[\t\n\r]/g, '')
    .toLowerCase()
}

// Match protocol-relative URLs such as "//evil.example", including backslash
// and control-character variants. Stop at the second separator so validation
// does not scan or normalize the URL body.
// eslint-disable-next-line no-control-regex
export const protocolRelativePrefixRegex = /^[\x00-\x20]*[\\/][\t\n\r]*[\\/]/

/**
 * Check if a URL string uses a protocol that is not in the allowlist or is
 * protocol-relative (e.g. "//evil.example"), which can navigate to another host.
 * Returns true for blocked protocols like javascript:, blob:, and data:, as
 * well as slash/backslash variants of protocol-relative URLs.
 *
 * Scheme parsing normalizes:
 * - Mixed case (JavaScript: → javascript:)
 * - Whitespace/control characters (java\nscript: → javascript:)
 * - Leading whitespace
 *
 * For relative URLs without a protocol-relative prefix, returns false.
 *
 * @param url - The URL string to check
 * @param allowlist - Set of protocols to allow
 * @returns true if the URL uses a protocol that is not allowed or can escape
 * the current origin through a protocol-relative URL
 */
export function isDangerousProtocol(
  url: string,
  allowlist: Set<string>,
): boolean {
  if (!url) return false

  // Inputs like "/\evil.example" can navigate to another host just like
  // "//evil.example", even with leading whitespace or ignored control characters.
  if (protocolRelativePrefixRegex.test(url)) {
    return true
  }

  const scheme = getUrlScheme(url)
  return scheme ? !allowlist.has(scheme) : false
}

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE
const HTML_ESCAPE_LOOKUP: { [match: string]: string } = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const HTML_ESCAPE_REGEX = /[&><\u2028\u2029]/g

/**
 * Escape HTML special characters in a string to prevent XSS attacks
 * when embedding strings in script tags during SSR.
 *
 * This is essential for preventing XSS vulnerabilities when user-controlled
 * content is embedded in inline scripts.
 */
export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_LOOKUP[match]!)
}

// Decode component data only. Leave protocol-relative URL handling to callers;
// this decoder also receives fragments, where slashes and backslashes are data.
export function decodePath(path: string) {
  if (!path) {
    return path
  }
  let result = path
  // eslint-disable-next-line no-control-regex
  if (/[%\\\x00-\x1f\x7f]/.test(path)) {
    const re = /%25|%5C/gi
    let cursor = 0
    let match
    result = ''
    while (null !== (match = re.exec(path))) {
      result += decodeSegment(path.slice(cursor, match.index)) + match[0]
      cursor = re.lastIndex
    }
    result += decodeSegment(cursor ? path.slice(cursor) : path)
  }

  return result
}

/**
 * Encodes a path the same way `new URL()` would, but without the overhead of full URL parsing.
 *
 * This function encodes:
 * - Whitespace characters (spaces → %20, tabs → %09, etc.)
 * - Non-ASCII/Unicode characters (emojis, accented characters, etc.)
 *
 * It preserves:
 * - Already percent-encoded sequences (won't double-encode %2F, %25, etc.)
 * - ASCII special characters valid in URL paths (@, $, &, +, etc.)
 * - Forward slashes as path separators
 *
 * Used to generate proper href values for SSR without constructing URL objects.
 *
 * @example
 * encodePathLikeUrl('/path/file name.pdf') // '/path/file%20name.pdf'
 * encodePathLikeUrl('/path/日本語') // '/path/%E6%97%A5%E6%9C%AC%E8%AA%9E'
 * encodePathLikeUrl('/path/already%20encoded') // '/path/already%20encoded' (preserved)
 */
export function encodePathLikeUrl(path: string): string {
  // Encode whitespace and non-ASCII characters that browsers encode in URLs.
  // The test uses one character class: it matches the same code units as the
  // replacement pattern below and is cheaper than the alternation.
  if (!/[\s\u0080-\uFFFF]/.test(path)) {
    return path
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check
  // eslint-disable-next-line no-control-regex
  return path.replace(/\s|[^\u0000-\u007F]/gu, encodeURIComponent)
}

/**
 * Builds the dev-mode CSS styles URL for route-scoped CSS collection.
 * Used by HeadContent components in all framework implementations to construct
 * the URL for the `/@tanstack-start/styles.css` endpoint.
 *
 * @param basepath - The router's basepath (may or may not have leading slash)
 * @param routeIds - Array of matched route IDs to include in the CSS collection
 * @returns The full URL path for the dev styles CSS endpoint
 */
export function buildDevStylesUrl(
  basepath: string,
  routeIds: Array<string>,
): string {
  // Trim all leading and trailing slashes from basepath
  const trimmedBasepath = basepath.replace(/^\/+|\/+$/g, '')
  // Build normalized basepath: empty string for root, or '/path' for non-root
  const normalizedBasepath = trimmedBasepath === '' ? '' : `/${trimmedBasepath}`
  return `${normalizedBasepath}/@tanstack-start/styles.css?routes=${encodeURIComponent(routeIds.join(','))}`
}

export function arraysEqual<T>(a: Array<T>, b: Array<T>) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
