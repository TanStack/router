import { decode, encode } from './qss'
import type { AnySchema } from './validators'

export const defaultParseSearch = parseSearchWith(JSON.parse)
export const defaultStringifySearch = stringifySearchWith(
  JSON.stringify,
  JSON.parse,
)

export function parseSearchWith(parser: (str: string) => any) {
  const isJsonParser = parser === JSON.parse
  return (searchStr: string): AnySchema => {
    if (searchStr[0] === '?') {
      searchStr = searchStr.substring(1)
    }

    const query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (const key in query) {
      const value = query[key]
      if (
        typeof value === 'string' &&
        (!isJsonParser || looksLikeJson(value))
      ) {
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

export function stringifySearchWith(
  stringify: (search: any) => string,
  parser?: (str: string) => any,
) {
  const hasParser = typeof parser === 'function'
  const isJsonParser = parser === JSON.parse
  function stringifyValue(val: any) {
    if (typeof val === 'object' && val !== null) {
      try {
        return stringify(val)
      } catch (_err) {
        // silent
      }
    } else if (
      hasParser &&
      typeof val === 'string' &&
      (!isJsonParser || looksLikeJson(val))
    ) {
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

/**
 * Fast check to see if the string is a likely to be a JSON value.
 * It could return false positives (returned true but wasn't actually a json),
 * but not false negatives (returned false but was actually a json).
 */
function looksLikeJson(str: string): boolean {
  if (!str) return false
  const c = str.charCodeAt(0)
  return (
    c === 34 || // "
    c === 123 || // {
    c === 91 || // [
    c === 45 || // -
    (c >= 48 && c <= 57) || // 0-9
    c === 116 || // t (true)
    c === 102 || // f (false)
    c === 110 // n (null)
  )
}
