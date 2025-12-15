import { normalizePath } from 'vite'
import { stripQueryString } from '../plugin-utils'

export const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'split-exports'].includes(process.env.TSR_VITE_DEBUG)

/**
 * File extensions that can be parsed as JavaScript/TypeScript.
 * These are the only files we should attempt to transform.
 */
const PARSEABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.mts',
  '.cjs',
  '.cts',
])

/**
 * Query parameters that indicate the module is being processed by
 * the directive functions plugin (server function extraction).
 * We should NOT transform exports in these modules because they
 * need to preserve the handler exports.
 */
const DIRECTIVE_QUERY_PATTERN = /[?&]tsr-directive-/

/**
 * Check if a module ID has a directive query parameter.
 * These modules are being processed for server function extraction
 * and should not have their exports transformed.
 */
export function hasDirectiveQuery(id: string): boolean {
  return DIRECTIVE_QUERY_PATTERN.test(id)
}

/**
 * Check if a file path has an extension that can be parsed as JS/TS.
 * Returns false for CSS, images, fonts, and other asset files.
 */
export function isParseableFile(id: string): boolean {
  // Strip query string first
  const cleanId = stripQueryString(id)

  // Find the extension
  const lastDot = cleanId.lastIndexOf('.')
  if (lastDot === -1) {
    // No extension - might be a virtual module, let it through
    return true
  }

  const ext = cleanId.slice(lastDot).toLowerCase()
  return PARSEABLE_EXTENSIONS.has(ext)
}

/**
 * Check if an ID should be excluded from transformation.
 * If srcDirectory is provided, only files inside it are processed.
 */
export function shouldExclude(
  id: string,
  srcDirectory: string | undefined,
  exclude: Array<string | RegExp> | undefined,
): boolean {
  // Normalize and strip query string for consistent path comparison
  const cleanId = normalizePath(stripQueryString(id))

  // Always exclude node_modules (safety net)
  if (cleanId.includes('/node_modules/')) {
    return true
  }

  // If srcDirectory is provided, only include files inside it
  if (srcDirectory) {
    const normalizedSrcDir = normalizePath(srcDirectory)
    if (!cleanId.startsWith(normalizedSrcDir)) {
      if (debug) {
        console.info(
          '[split-exports] Skipping (outside srcDirectory):',
          cleanId,
        )
      }
      return true
    }
  }

  // Check custom exclusion patterns
  if (exclude && exclude.length > 0) {
    for (const pattern of exclude) {
      if (typeof pattern === 'string') {
        if (cleanId.includes(pattern)) {
          return true
        }
      } else if (pattern.test(cleanId)) {
        return true
      }
    }
  }

  return false
}
