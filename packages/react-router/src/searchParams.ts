import { decode, encode } from './qss'
import type { AnySearchSchema } from './route'

export const defaultParseSearch = parseSearchWith((str) => JSON.parse(str))
export const defaultStringifySearch = stringifySearchWith(
  (value) => JSON.stringify(value),
  (str) => JSON.parse(str),
)

export function parseSearchWith(parser: (str: string, key: string) => any) {
  return (searchStr: string): AnySearchSchema => {
    if (searchStr.substring(0, 1) === '?') {
      searchStr = searchStr.substring(1)
    }

    const query: Record<string, unknown> = decode(searchStr)

    // Try to parse any query params that might be json
    for (const key in query) {
      const value = query[key]
      if (typeof value === 'string') {
        try {
          query[key] = parser(value, key)
        } catch (err) {
          //
        }
      }
    }

    return query
  }
}

export function stringifySearchWith(
  stringify: (search: any, key: string) => string,
  parser?: (str: string, key: string) => any,
) {
  function stringifyValue(val: any, key: string) {
    if (typeof val === 'object' && val !== null) {
      try {
        return stringify(val, key)
      } catch (err) {
        // silent
      }
    } else if (typeof val === 'string' && typeof parser === 'function') {
      try {
        // Check if it's a valid parseable string.
        // If it is, then stringify it again.
        parser(val, key)
        return stringify(val, key)
      } catch (err) {
        // silent
      }
    }
    return val
  }

  return (search: Record<string, any>) => {
    search = { ...search }

    Object.keys(search).forEach((key) => {
      const val = search[key]
      if (typeof val === 'undefined' || val === undefined) {
        delete search[key]
      } else {
        search[key] = stringifyValue(val, key)
      }
    })

    const searchStr = encode(search as Record<string, string>).toString()

    return searchStr ? `?${searchStr}` : ''
  }
}

export type SearchSerializer = (searchObj: Record<string, any>) => string
export type SearchParser = (searchStr: string) => Record<string, any>
