import {
  OWNED_QUERY_KEYS,
  isSplitGroupValue,
} from '@tanstack/router-utils/compiler'

const splitKey = OWNED_QUERY_KEYS.split

/**
 * Whether a module's query (without its `?`) makes the module's chunk a
 * chunk of its route file in the manifest: the query names a split group
 * of the file (`tsr-split=component`), which the route module imports
 * lazily. A module the file's split code shares (`shared---…`) and an
 * extracted export (`export---…`) do not: split code that needs one imports
 * it statically, so the route reaches it through its chunks' imports, and
 * its other importers (another route's chunk, a lazy module, a Hydrate
 * boundary's chunk) are no chunks of the route. The key is literal and the
 * first value counts, as `URLSearchParams` reads them.
 */
export function isRouteSplitQuery(query: string): boolean {
  if (!query.includes(splitKey)) {
    return false
  }
  const value = new URLSearchParams(query).get(splitKey)
  return value !== null && isSplitGroupValue(value)
}
