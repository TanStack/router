import babel from '@babel/core'
import * as t from '@babel/types'
import { parseAst } from '@tanstack/router-utils'

type UsagePos = { line: number; column0: number }

/**
 * Given transformed code, returns the first "meaningful" usage position for an
 * import from `source` that survives compilation.
 *
 * "Preferred" positions (call, new, member-access) take priority over bare
 * identifier references. The returned column is 0-based (Babel loc semantics).
 */
export function findPostCompileUsagePos(
  code: string,
  source: string,
): UsagePos | undefined {
  const ast = parseAst({ code })

  // Collect local names bound from this specifier
  const imported = new Set<string>()
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node) && node.source.value === source) {
      if (node.importKind === 'type') continue
      for (const s of node.specifiers) {
        if (t.isImportSpecifier(s) && s.importKind === 'type') continue
        imported.add(s.local.name)
      }
    }
  }
  if (imported.size === 0) return undefined

  let preferred: UsagePos | undefined
  let anyUsage: UsagePos | undefined

  // babel.traverse can throw on malformed scopes (e.g. duplicate bindings from
  // import + const re-declaration) because parseAst doesn't attach a hub
  try {
    babel.traverse(ast, {
      ImportDeclaration(path) {
        path.skip()
      },

      Identifier(path: babel.NodePath<t.Identifier>) {
        if (preferred && anyUsage) {
          path.stop()
          return
        }

        const { node, parent, scope } = path
        if (!imported.has(node.name)) return

        // Skip binding positions (declarations, import specifiers, etc.)
        if (path.isBindingIdentifier()) return

        // Skip non-shorthand object property keys — they don't reference the import
        if (
          t.isObjectProperty(parent) &&
          parent.key === node &&
          !parent.computed &&
          !parent.shorthand
        )
          return
        if (t.isObjectMethod(parent) && parent.key === node && !parent.computed)
          return
        if (t.isExportSpecifier(parent) && parent.exported === node) return

        // Skip if shadowed by a closer binding
        const binding = scope.getBinding(node.name)
        if (binding && binding.kind !== 'module') return

        const loc = node.loc?.start
        if (!loc) return
        const pos: UsagePos = { line: loc.line, column0: loc.column }

        const isPreferred =
          (t.isCallExpression(parent) && parent.callee === node) ||
          (t.isNewExpression(parent) && parent.callee === node) ||
          (t.isMemberExpression(parent) && parent.object === node)

        if (isPreferred) {
          preferred ||= pos
        } else {
          anyUsage ||= pos
        }
      },
    })
  } catch {
    // Scope analysis failed — cannot determine usage positions reliably
    return undefined
  }

  return preferred ?? anyUsage
}
