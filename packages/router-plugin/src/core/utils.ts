import { b, walk } from 'yuku-ast'
import type { Identifier, Program, Property } from '@yuku-toolchain/types'

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

  if (prop.key.type === 'Identifier') {
    return prop.key.name
  }

  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
    return prop.key.value
  }

  return undefined
}

const reservedProgramNames = new WeakMap<Program, Set<string>>()

export function getUniqueProgramIdentifier(
  program: Program,
  baseName: string,
): Identifier {
  let names = reservedProgramNames.get(program)
  if (!names) {
    names = new Set<string>()
    reservedProgramNames.set(program, names)
  }
  walk(program, {
    Identifier(node) {
      names.add(node.name)
    },
    JSXIdentifier(node) {
      names.add(node.name)
    },
  })
  let name = baseName
  let suffix = 2
  while (names.has(name)) {
    name = `${baseName}${suffix++}`
  }
  names.add(name)
  return b.Identifier({ name })
}
