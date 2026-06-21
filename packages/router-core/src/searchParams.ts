import { decode, encode } from './qss'
import type { AnySchema } from './validators'

/**
 * Returns true if `str` could be the start of a valid JSON value, deciding from
 * the first non-whitespace character only. This is a superset of JSON's
 * value-start grammar, so any string `JSON.parse` would accept returns true —
 * meaning we never skip a parse that would have succeeded. It exists purely to
 * skip `JSON.parse` (and the expensive `SyntaxError` it throws) for values that
 * cannot be JSON, e.g. plain search params like `?q=hello&f=live`.
 */
function couldBeJson(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    // JSON.parse tolerates leading whitespace (space, tab, LF, CR)
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      continue
    }
    return (
      c === 123 || // {
      c === 91 || // [
      c === 34 || // "
      c === 45 || // -
      (c >= 48 && c <= 57) || // 0-9
      c === 116 || // t (true)
      c === 102 || // f (false)
      c === 110 // n (null)
    )
  }
  return false
}

/**
 * `JSON.parse`, skipped for values that cannot be JSON. Returning the original
 * string for non-JSON values is equivalent to letting `JSON.parse` throw and
 * `parseSearchWith` keep the raw string — just without the thrown error.
 */
function parseMaybeJson(value: string) {
  return couldBeJson(value) ? JSON.parse(value) : value
}

/** Default `parseSearch` that strips leading '?' and JSON-parses values. */
export const defaultParseSearch = parseSearchWith(parseMaybeJson)
/** Default `stringifySearch` using JSON.stringify for complex values. */
export const defaultStringifySearch = stringifySearchWith(
  JSON.stringify,
  JSON.parse,
)

/**
 * Build a `parseSearch` function using a provided JSON-like parser.
 *
 * The returned function strips a leading `?`, decodes values, and attempts to
 * JSON-parse string values using the given `parser`.
 *
 * @param parser Function to parse a string value (e.g. `JSON.parse`).
 * @returns A `parseSearch` function compatible with `Router` options.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization
 */
export function parseSearchWith(parser: (str: string) => any) {
  return (searchStr: string): AnySchema => {
    if (searchStr[0] === '?') {
      searchStr = searchStr.substring(1)
    }

    const query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (const key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value)
        } catch (_err) {
          // silent
        }
      }
    }

    return query
  }
}

/**
 * Build a `stringifySearch` function using a provided serializer.
 *
 * Non-primitive values are serialized with `stringify`. If a `parser` is
 * supplied, string values that are parseable are re-serialized to ensure
 * symmetry with `parseSearch`.
 *
 * @param stringify Function to serialize a value (e.g. `JSON.stringify`).
 * @param parser Optional parser to detect parseable strings.
 * @returns A `stringifySearch` function compatible with `Router` options.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization
 */
export function stringifySearchWith(
  stringify: (search: any) => string,
  parser?: (str: string) => any,
) {
  const hasParser = typeof parser === 'function'
  function stringifyValue(val: any) {
    if (typeof val === 'object' && val !== null) {
      try {
        return stringify(val)
      } catch (_err) {
        // silent
      }
    } else if (hasParser && typeof val === 'string') {
      try {
        // Check if it's a valid parseable string.
        // If it is, then stringify it again.
        parser(val)
        return stringify(val)
      } catch (_err) {
        // silent
      }
    }
    return val
  }

  return (search: Record<string, any>) => {
    const searchStr = encode(search, stringifyValue)
    return searchStr ? `?${searchStr}` : ''
  }
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>
