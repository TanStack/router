import { deepEqual } from './utils'
import type { NoInfer, PickOptional } from './utils'
import type { SearchMiddleware } from './route'
import type { IsRequiredParams } from './link'

/**
 * Retain specified search params across navigations.
 *
 * If `keys` is `true`, retain all current params. Otherwise, copy only the
 * listed keys from the current search into the next search.
 *
 * @param keys `true` to retain all, or a list of keys to retain.
 * @returns A search middleware suitable for route `search.middlewares`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/retainSearchParamsFunction
 */
export function retainSearchParams<TSearchSchema extends object>(
  keys: Array<keyof TSearchSchema> | true,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    const result = next(search)
    if (keys === true) {
      return { ...search, ...result }
    }
    const copy = { ...result }
    // add missing keys from search to copy
    keys.forEach((key) => {
      if (!(key in copy)) {
        copy[key] = search[key]
      }
    })
    return copy
  }
}

/**
 * Remove optional or default-valued search params from navigations.
 *
 * - Pass `true` (only if there are no required search params) to strip all.
 * - Pass an array to always remove those optional keys.
 * - Pass an object of default values; keys equal (deeply) to the defaults are removed.
 *
 * @returns A search middleware suitable for route `search.middlewares`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/stripSearchParamsFunction
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
    const result = { ...next(search) } as Record<string, unknown>
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
