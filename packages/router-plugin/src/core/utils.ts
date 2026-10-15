import { b, nameOf } from 'yuku-ast'
import type { Identifier, Property } from '@yuku-toolchain/types'

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

/**
 * A name not in `reservedNames`, which then holds it. An output's reserved
 * names are the names its source declares or references, and the names given
 * out for it: an identifier the output gains must be named by this function,
 * or must not declare or reference a name a later call could choose
 * (`baseName`, or it with a numeric suffix). The HMR snippets only declare and
 * reference names such as `hot`, `hotData` and `window`.
 */
export function getUniqueProgramIdentifier(
  reservedNames: Set<string>,
  baseName: string,
): Identifier {
  let name = baseName
  let suffix = 2
  while (reservedNames.has(name)) {
    name = `${baseName}${suffix++}`
  }
  reservedNames.add(name)
  return b.Identifier({ name })
}
