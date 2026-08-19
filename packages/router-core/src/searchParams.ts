import { isServer } from '@tanstack/router-core/isServer'
import { decode, encode } from './qss'
import type { AnySchema } from './validators'

// JSON can start with whitespace, ", [, {, -, a digit, or fa/nu/tr.
// False positives safely fall through to JSON.parse.
const jsonStart = /^(?:\s|["[{\d-]|fa|nu|tr)/

// Returns 0 for impossible JSON, 1 for a validated primitive, and 2 when the
// full parser is still needed for a string, array, or object.
function getServerJsonKind(value: string): 0 | 1 | 2 {
  const length = value.length
  let index = 0
  let code = value.charCodeAt(index)

  // Strings, arrays, objects, and leading JSON whitespace still need the full
  // parser. Returning immediately avoids scanning whitespace-prefixed values
  // twice.
  if (
    code === 34 ||
    code === 91 ||
    code === 123 ||
    code === 32 ||
    code === 9 ||
    code === 10 ||
    code === 13
  ) {
    return 2
  }

  // Validate the three JSON literal words without allocating a substring.
  if (code === 116) {
    if (
      value.charCodeAt(++index) !== 114 ||
      value.charCodeAt(++index) !== 117 ||
      value.charCodeAt(++index) !== 101
    ) {
      return 0
    }
    code = value.charCodeAt(++index)
  } else if (code === 102) {
    if (
      value.charCodeAt(++index) !== 97 ||
      value.charCodeAt(++index) !== 108 ||
      value.charCodeAt(++index) !== 115 ||
      value.charCodeAt(++index) !== 101
    ) {
      return 0
    }
    code = value.charCodeAt(++index)
  } else if (code === 110) {
    if (
      value.charCodeAt(++index) !== 117 ||
      value.charCodeAt(++index) !== 108 ||
      value.charCodeAt(++index) !== 108
    ) {
      return 0
    }
    code = value.charCodeAt(++index)
  } else {
    // Validate the complete JSON number grammar before bypassing JSON.parse.
    if (code === 45) {
      code = value.charCodeAt(++index)
    }
    if (code === 48) {
      code = value.charCodeAt(++index)
    } else if (code >= 49 && code <= 57) {
      do {
        code = value.charCodeAt(++index)
      } while (code >= 48 && code <= 57)
    } else {
      return 0
    }

    if (code === 46) {
      code = value.charCodeAt(++index)
      if (!(code >= 48 && code <= 57)) {
        return 0
      }
      do {
        code = value.charCodeAt(++index)
      } while (code >= 48 && code <= 57)
    }

    if (code === 69 || code === 101) {
      code = value.charCodeAt(++index)
      if (code === 43 || code === 45) {
        code = value.charCodeAt(++index)
      }
      if (!(code >= 48 && code <= 57)) {
        return 0
      }
      do {
        code = value.charCodeAt(++index)
      } while (code >= 48 && code <= 57)
    }
  }

  while (code === 32 || code === 9 || code === 10 || code === 13) {
    code = value.charCodeAt(++index)
  }
  return index === length ? 1 : 0
}

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
  const isJsonParser = parser === JSON.parse
  function stringifyValueOnServer(val: any) {
    if (val && typeof val === 'object') {
      try {
        return stringify(val)
      } catch {
        // silent
      }
    } else if (typeof val === 'string') {
      const jsonKind = getServerJsonKind(val)
      if (jsonKind === 0) {
        return val
      }
      try {
        if (jsonKind === 2) {
          parser!(val)
        }
        return stringify(val)
      } catch {
        // silent
      }
    }
    return val
  }

  function stringifyValue(val: any) {
    if (val && typeof val === 'object') {
      try {
        return stringify(val)
      } catch (_err) {
        // silent
      }
    } else if (parser && typeof val === 'string') {
      // Keep the client check compact while skipping impossible parses.
      if (isJsonParser && !jsonStart.test(val)) {
        return val
      }
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
    // Keep this read at invocation time. The server export also loads router
    // code, so reading it while this factory initializes can hit a module TDZ.
    if (isServer) {
      if (isJsonParser) {
        const searchStr = encode(search, stringifyValueOnServer)
        return searchStr ? `?${searchStr}` : ''
      }
    }
    const searchStr = encode(search, stringifyValue)
    return searchStr ? `?${searchStr}` : ''
  }
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>
