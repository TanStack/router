import { stringify, parse } from './jsurl'

export function stringifySearch(search: Record<string, unknown>) {
  search = { ...search }

  if (search) {
    Object.keys(search).forEach((key) => {
      const val = search[key]
      if (typeof val === 'undefined' || val === undefined) {
        delete search[key]
      } else if (val && typeof val === 'object' && val !== null) {
        try {
          search[key] = stringify(val)
        } catch (err) {
          // silent
        }
      }
    })
  }

  const searchStr = new URLSearchParams(
    search as Record<string, string>,
  ).toString()

  return searchStr ? `?${searchStr}` : ''
}

export function parseSearch(searchStr: string): Record<string, any> {
  if (searchStr.substring(0, 1) === '?') {
    searchStr = searchStr.substring(1)
  }

  let query: Record<string, unknown> = Object.fromEntries(
    (new URLSearchParams(searchStr) as any).entries(),
  )

  // Try to parse any query params that might be json
  for (let key in query) {
    const value = query[key]
    if (typeof value === 'string') {
      try {
        query[key] = parse(value)
      } catch (err) {
        //
      }
    }
  }

  return query
}
