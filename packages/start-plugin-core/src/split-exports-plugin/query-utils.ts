export const SPLIT_EXPORTS_QUERY_KEY = 'tss-split-exports'

/**
 * Split a module ID into path and query string parts.
 * Uses a simple split since module IDs may not be valid URLs.
 */
function splitIdParts(id: string): { path: string; query: string } {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1) {
    return { path: id, query: '' }
  }
  return {
    path: id.slice(0, queryIndex),
    query: id.slice(queryIndex + 1),
  }
}

/**
 * Check if an ID has the split-exports query parameter.
 * Uses simple string matching for performance.
 */
export function hasSplitExportsQuery(id: string): boolean {
  return (
    id.includes(`?${SPLIT_EXPORTS_QUERY_KEY}=`) ||
    id.includes(`&${SPLIT_EXPORTS_QUERY_KEY}=`)
  )
}

/**
 * Parse the split-exports query parameter from a module ID.
 * Returns the set of exported names that should be kept, or null if no query is present.
 * Note: We manually extract the raw value to avoid URLSearchParams auto-decoding,
 * which allows us to correctly split on comma before decoding individual names.
 */
export function parseSplitExportsQuery(id: string): Set<string> | null {
  const { query } = splitIdParts(id)
  if (!query) return null

  // Manually find the parameter value to avoid URLSearchParams auto-decoding
  const prefix = `${SPLIT_EXPORTS_QUERY_KEY}=`
  const params = query.split('&')
  const param = params.find((p) => p.startsWith(prefix))
  if (!param) return null

  const rawValue = param.slice(prefix.length)
  if (!rawValue) return null

  // Split on comma first (our separator), then decode each name
  return new Set(rawValue.split(',').filter(Boolean).map(decodeURIComponent))
}

/**
 * Remove the split-exports query parameter from a module ID.
 * Preserves other query parameters.
 */
export function removeSplitExportsQuery(id: string): string {
  const { path, query } = splitIdParts(id)
  if (!query) return id

  const params = new URLSearchParams(query)
  if (!params.has(SPLIT_EXPORTS_QUERY_KEY)) return id

  params.delete(SPLIT_EXPORTS_QUERY_KEY)
  const remainingQuery = params.toString()
  return remainingQuery ? `${path}?${remainingQuery}` : path
}

/**
 * Append the split-exports query parameter to a source path.
 * Handles existing query strings correctly.
 * Export names are URL-encoded to handle $ and unicode characters in identifiers.
 */
export function appendSplitExportsQuery(
  source: string,
  exportNames: Set<string>,
): string {
  if (exportNames.size === 0) return source

  const { path, query } = splitIdParts(source)

  // Sort names for consistent, cache-friendly query strings
  // URL-encode individual names to handle $ and unicode characters in identifiers
  const sortedNames = Array.from(exportNames).sort().map(encodeURIComponent)
  const newParam = `${SPLIT_EXPORTS_QUERY_KEY}=${sortedNames.join(',')}`

  if (!query) {
    return `${path}?${newParam}`
  }

  return `${path}?${query}&${newParam}`
}

/**
 * Extract the split-exports query from an ID and return both the clean ID and export names.
 */
export function extractSplitExportsQuery(id: string): {
  cleanId: string
  exportNames: Set<string>
} {
  const exportNames = parseSplitExportsQuery(id) || new Set()
  const cleanId = removeSplitExportsQuery(id)
  return { cleanId, exportNames }
}
