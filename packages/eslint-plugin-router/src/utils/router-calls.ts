import { AST_NODE_TYPES } from '@typescript-eslint/utils'
import type { TSESLint, TSESTree } from '@typescript-eslint/utils'

export interface RouterCall<TName extends string> {
  /**
   * The name the router package exports the callee under: `createFileRoute`
   * for `cfr(...)` after `import { createFileRoute as cfr }`.
   */
  name: TName
  call: TSESTree.CallExpression
}

function isRouterPackage(source: string): boolean {
  return source.startsWith('@tanstack/') && source.endsWith('-router')
}

/**
 * Every call of one of `names` imported from a TanStack Router package
 * (`@tanstack/react-router`, `@tanstack/solid-router`, ...), also under an
 * alias (`cfr(...)`) or through a namespace import (`Router.createRoute(...)`).
 *
 * The calls are found through the references of the imported bindings, so a
 * local binding that shadows the import is not one of them, and an import
 * written after its use still counts.
 */
export function getRouterCalls<TName extends string>(
  sourceCode: Readonly<TSESLint.SourceCode>,
  program: TSESTree.Program,
  names: ReadonlySet<TName>,
): Array<RouterCall<TName>> {
  // any string may be looked up; a hit is a `TName`
  const wanted: ReadonlySet<string> = names
  const calls: Array<RouterCall<TName>> = []
  for (const statement of program.body) {
    if (
      statement.type !== AST_NODE_TYPES.ImportDeclaration ||
      !isRouterPackage(statement.source.value)
    ) {
      continue
    }
    for (const specifier of statement.specifiers) {
      // the exported name of a named import, resolved once so the references
      // of an unwanted import are never walked; a namespace import names it
      // per member access instead
      let imported: string | undefined
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
        imported =
          specifier.imported.type === AST_NODE_TYPES.Identifier
            ? specifier.imported.name
            : specifier.imported.value
        if (!wanted.has(imported)) {
          continue
        }
      } else if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
        continue
      }
      for (const variable of sourceCode.getDeclaredVariables(specifier)) {
        for (const { identifier } of variable.references) {
          let callee: TSESTree.Node = identifier
          let name = imported
          if (name === undefined) {
            // `Router.createRoute` after `import * as Router`
            const member = identifier.parent
            if (
              member.type !== AST_NODE_TYPES.MemberExpression ||
              member.object !== identifier ||
              member.computed ||
              member.property.type !== AST_NODE_TYPES.Identifier ||
              !wanted.has(member.property.name)
            ) {
              continue
            }
            name = member.property.name
            callee = member
          }
          const call = callee.parent
          if (
            call.type === AST_NODE_TYPES.CallExpression &&
            call.callee === callee
          ) {
            calls.push({ name: name as TName, call })
          }
        }
      }
    }
  }
  return calls
}
