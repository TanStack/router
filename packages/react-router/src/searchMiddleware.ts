import type { SearchMiddleware } from './route'

export function retainSearchParams<TSearchSchema extends object>(
  keys: Array<keyof TSearchSchema>,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    const result = next(search)
    // add missing keys from search to result
    keys.forEach((key) => {
      if (!(key in result)) {
        result[key] = search[key]
      }
    })
    return result
  }
}
