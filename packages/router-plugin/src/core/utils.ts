import * as t from '@babel/types'
import type babel from '@babel/core'

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

export function getUniqueProgramIdentifier(
  programPath: babel.NodePath<t.Program>,
  baseName: string,
): t.Identifier {
  let name = baseName
  let suffix = 2

  while (
    programPath.scope.hasBinding(name) ||
    programPath.scope.hasGlobal(name)
  ) {
    name = `${baseName}${suffix}`
    suffix++
  }

  return t.identifier(name)
}
