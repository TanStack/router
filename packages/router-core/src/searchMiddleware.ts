import { deepEqual } from './utils'
import type { NoInfer, PickOptional } from './utils'
import type { SearchMiddleware } from './route'
import type { IsRequiredParams } from './link'

/**
 * Search middleware to retain specified search params across links.
 *
 * If `keys` is `true`, all existing params are retained. Otherwise, missing
 * keys from the current search are merged into the next value produced by
 * subsequent middlewares.
 */
export function retainSearchParams<TSearchSchema extends object>(
  keys: Array<keyof TSearchSchema> | true,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    const result = next(search)
    if (keys === true) {
      return { ...search, ...result }
    }
    // add missing keys from search to result
    keys.forEach((key) => {
      if (!(key in result)) {
        result[key] = search[key]
      }
    })
    return result
  }
}

/**
 * Search middleware to remove optional search params from links.
 *
 * Accepts either a list of keys or an object map of default values. Keys with
 * values matching the provided defaults are removed from the final search.
 * Passing `true` removes all params.
 */
export function stripSearchParams<
  TSearchSchema,
  TOptionalProps = PickOptional<NoInfer<TSearchSchema>>,
  const TValues =
    | Partial<NoInfer<TOptionalProps>>
    | Array<keyof TOptionalProps>,
  const TInput = IsRequiredParams<TSearchSchema> extends never
    ? TValues | true
    : TValues,
>(input: NoInfer<TInput>): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    if (input === true) {
      return {}
    }
    const result = next(search) as Record<string, unknown>
    if (Array.isArray(input)) {
      input.forEach((key) => {
        delete result[key]
      })
    } else {
      Object.entries(input as Record<string, unknown>).forEach(
        ([key, value]) => {
          if (deepEqual(result[key], value)) {
            delete result[key]
          }
        },
      )
    }
    return result as any
  }
}
