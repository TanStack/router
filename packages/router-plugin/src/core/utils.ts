import { nameOf } from 'yuku-ast'
import type { Property } from '@yuku-toolchain/types'

export const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'router-plugin'].includes(process.env.TSR_VITE_DEBUG)

/**
 * Normalizes a file path by converting Windows backslashes to forward slashes.
 * This ensures consistent path handling across different bundlers and operating systems.
 *
 * The route generator stores paths with forward slashes, but rspack/webpack on Windows
 * pass native paths with backslashes to transform handlers.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

export const routeFactoryCallCodeFilter = [
  /\bcreateFileRoute\s*\(/,
  /\bcreateRootRoute\s*\(/,
  /\bcreateRootRouteWithContext\s*(?:<|\()/,
]

export function getObjectPropertyKeyName(prop: Property): string | undefined {
  if (prop.computed) {
    return undefined
  }

  return nameOf(prop.key) ?? undefined
}
