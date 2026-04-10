import { SERVER_FN_LOOKUP } from '../constants'

export const SERVER_FN_LOOKUP_QUERY: string = `?${SERVER_FN_LOOKUP}`

export const IMPORT_PROTECTION_DEBUG: boolean =
  process.env.TSR_IMPORT_PROTECTION_DEBUG === '1' ||
  process.env.TSR_IMPORT_PROTECTION_DEBUG === 'true'

export const IMPORT_PROTECTION_DEBUG_FILTER: string | undefined =
  process.env.TSR_IMPORT_PROTECTION_DEBUG_FILTER

export const KNOWN_SOURCE_EXTENSIONS: Set<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
])

/** Vite's browser-visible prefix for virtual modules (replaces `\0`). */
export const VITE_BROWSER_VIRTUAL_PREFIX = '/@id/__x00__'
