import { b, nameOf, walk } from 'yuku-ast'
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

  return nameOf(prop.key) ?? undefined
}

/** The names each output program contains or was given. */
const reservedProgramNames = new WeakMap<Program, Set<string>>()

/**
 * A name nothing in `program` uses, nor any earlier call gave out. The program
 * is only read on the first call: an identifier added afterwards must be named
 * by this function, or must not declare or reference a name a later call could
 * choose (`baseName`, or it with a numeric suffix). The HMR snippets only
 * declare and reference names such as `hot`, `hotData` and `window`.
 */
export function getUniqueProgramIdentifier(
  program: Program,
  baseName: string,
): Identifier {
  let names = reservedProgramNames.get(program)
  if (!names) {
    const programNames = new Set<string>()
    walk(program, {
      Identifier(node) {
        programNames.add(node.name)
      },
      JSXIdentifier(node) {
        programNames.add(node.name)
      },
    })
    names = programNames
    reservedProgramNames.set(program, names)
  }
  let name = baseName
  let suffix = 2
  while (names.has(name)) {
    name = `${baseName}${suffix++}`
  }
  names.add(name)
  return b.Identifier({ name })
}
