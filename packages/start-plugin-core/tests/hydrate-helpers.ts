/**
 * `<Hydrate>` test helpers that are not part of the shared Start harness
 * (`regression-helpers.ts`).
 */
import { parseSync } from 'vite'
import { compileHydrate } from './regression-helpers'
import type { Framework } from './regression-helpers'

type Node = { type: string; [key: string]: unknown }

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).type === 'string'
  )
}

/**
 * Names that refer to bindings in `code` (declared or read): identifiers and
 * JSX component names, but not property names, object keys, JSX attribute
 * names or the names other modules export.
 */
function bindingNames(code: string) {
  const parsed = parseSync('module.tsx', code, { sourceType: 'module' })
  if (parsed.errors.length > 0) {
    throw new Error(`Cannot parse module: ${parsed.errors[0]!.message}`)
  }
  const names = new Set<string>()
  const visit = (node: unknown, parent?: Node, key?: string) => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, parent, key)
      }
      return
    }
    if (!isNode(node)) {
      return
    }
    const nonReference =
      (parent?.type === 'MemberExpression' &&
        key === 'property' &&
        !parent.computed) ||
      (parent?.type === 'Property' &&
        key === 'key' &&
        !parent.computed &&
        !parent.shorthand) ||
      ((parent?.type === 'MethodDefinition' ||
        parent?.type === 'PropertyDefinition') &&
        key === 'key' &&
        !parent.computed) ||
      (parent?.type === 'ImportSpecifier' && key === 'imported') ||
      (parent?.type === 'ExportSpecifier' && key === 'exported') ||
      (parent?.type === 'JSXAttribute' && key === 'name') ||
      (parent?.type === 'JSXMemberExpression' && key === 'property')
    if (
      !nonReference &&
      (node.type === 'Identifier' ||
        (node.type === 'JSXIdentifier' && /^[A-Z_$]/.test(node.name as string)))
    ) {
      names.add(node.name as string)
    }
    for (const child in node) {
      if (child !== 'type') {
        visit(node[child], node, child)
      }
    }
  }
  visit(parsed.program)
  return names
}

/**
 * The binding names the compiler introduces when it splits the `<Hydrate>`
 * children of `code`: names in the client parent, its chunks or the server
 * module that `code` does not have. A fixture declaring them as user
 * bindings or globals checks that generated names never collide with the
 * user's, whatever names the compiler picks.
 */
export async function generatedNames(
  code: string,
  options: { framework?: Framework } = {},
) {
  const source = bindingNames(code)
  const client = await compileHydrate('client', code, options)
  const server = await compileHydrate('server', code, options)
  const names = new Set<string>()
  for (const output of [client.parent, ...client.chunks, server.parent]) {
    for (const name of bindingNames(output)) {
      if (!source.has(name)) {
        names.add(name)
      }
    }
  }
  return [...names].sort()
}
