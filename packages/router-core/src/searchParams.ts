import { decode, encode } from './qss'
import type { AnySchema } from './validators'

/** Default `parseSearch` that strips leading '?' and JSON-parses values. */
export const defaultParseSearch = parseSearchWith(JSON.parse)
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
          const parsed = parser(value)
          // Reject numeric parses that do not round-trip back to the original
          // string (e.g. '662E41' → 6.62e+43, '723421968459640832' → precision
          // loss). Keep the original string so callers receive what was in the URL.
          if (typeof parsed === 'number' && String(parsed) !== value) {
            // silent — keep original string
          } else {
            query[key] = parsed
          }
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
