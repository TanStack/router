/**
 * The binding names of a module's code (an independent parse, Oxc through
 * Vite's `parseSync`): what an adaptive hygiene probe offers user code as
 * names, after reading them from what the compiler served (SPEC G15).
 */
import { parseSync } from 'vite'

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
export function bindingNames(code: string) {
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
