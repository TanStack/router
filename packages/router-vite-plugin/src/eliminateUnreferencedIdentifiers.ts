// Copied from https://github.com/pcattori/vite-env-only/blob/main/src/dce.ts
// Adapted with some minor changes for the purpose of this project

import * as t from '@babel/types'
import type { types as BabelTypes } from '@babel/core'
import type { NodePath } from '@babel/traverse'

type IdentifierPath = NodePath<BabelTypes.Identifier>

// export function findReferencedIdentifiers(
//   programPath: NodePath<BabelTypes.Program>,
// ): Set<IdentifierPath> {
//   const refs = new Set<IdentifierPath>()

//   function markFunction(
//     path: NodePath<
//       | BabelTypes.FunctionDeclaration
//       | BabelTypes.FunctionExpression
//       | BabelTypes.ArrowFunctionExpression
//     >,
//   ) {
//     const ident = getIdentifier(path)
//     if (ident?.node && isIdentifierReferenced(ident)) {
//       refs.add(ident)
//     }
//   }

//   function markImport(
//     path: NodePath<
//       | BabelTypes.ImportSpecifier
//       | BabelTypes.ImportDefaultSpecifier
//       | BabelTypes.ImportNamespaceSpecifier
//     >,
//   ) {
//     const local = path.get('local')
//     if (isIdentifierReferenced(local)) {
//       refs.add(local)
//     }
//   }

//   programPath.traverse({
//     VariableDeclarator(path) {
//       if (path.node.id.type === 'Identifier') {
//         const local = path.get('id') as NodePath<BabelTypes.Identifier>
//         if (isIdentifierReferenced(local)) {
//           refs.add(local)
//         }
//       } else if (path.node.id.type === 'ObjectPattern') {
//         const pattern = path.get('id') as NodePath<BabelTypes.ObjectPattern>

//         const properties = pattern.get('properties')
//         properties.forEach((p) => {
//           const local = p.get(
//             p.node.type === 'ObjectProperty'
//               ? 'value'
//               : p.node.type === 'RestElement'
//                 ? 'argument'
//                 : (function () {
//                     throw new Error('invariant')
//                   })(),
//           ) as NodePath<BabelTypes.Identifier>
//           if (isIdentifierReferenced(local)) {
//             refs.add(local)
//           }
//         })
//       } else if (path.node.id.type === 'ArrayPattern') {
//         const pattern = path.get('id') as NodePath<BabelTypes.ArrayPattern>

//         const elements = pattern.get('elements')
//         elements.forEach((e) => {
//           let local: NodePath<BabelTypes.Identifier>
//           if (e.node?.type === 'Identifier') {
//             local = e as NodePath<BabelTypes.Identifier>
//           } else if (e.node?.type === 'RestElement') {
//             local = e.get('argument') as NodePath<BabelTypes.Identifier>
//           } else {
//             return
//           }

//           if (isIdentifierReferenced(local)) {
//             refs.add(local)
//           }
//         })
//       }
//     },

//     FunctionDeclaration: markFunction,
//     FunctionExpression: markFunction,
//     ArrowFunctionExpression: markFunction,
//     ImportSpecifier: markImport,
//     ImportDefaultSpecifier: markImport,
//     ImportNamespaceSpecifier: markImport,
//   })
//   return refs
// }

/**
 * @param refs - If provided, only these identifiers will be considered for removal.
 */
export const eliminateUnreferencedIdentifiers = (
  programPath: NodePath<BabelTypes.Program>,
  refs?: Set<IdentifierPath>,
) => {
  let referencesRemovedInThisPass: number

  const shouldBeRemoved = (ident: IdentifierPath) => {
    if (isIdentifierReferenced(ident)) return false
    if (!refs) return true
    return refs.has(ident)
  }

  const sweepFunction = (
    path: NodePath<
      | BabelTypes.FunctionDeclaration
      | BabelTypes.FunctionExpression
      | BabelTypes.ArrowFunctionExpression
    >,
  ) => {
    const identifier = getIdentifier(path)
    if (identifier?.node && shouldBeRemoved(identifier)) {
      ++referencesRemovedInThisPass

      if (
        t.isAssignmentExpression(path.parentPath.node) ||
        t.isVariableDeclarator(path.parentPath.node)
      ) {
        path.parentPath.remove()
      } else {
        path.remove()
      }
    }
  }

  const sweepImport = (
    path: NodePath<
      | BabelTypes.ImportSpecifier
      | BabelTypes.ImportDefaultSpecifier
      | BabelTypes.ImportNamespaceSpecifier
    >,
  ) => {
    const local = path.get('local')
    if (shouldBeRemoved(local)) {
      ++referencesRemovedInThisPass
      path.remove()
      if (
        (path.parent as BabelTypes.ImportDeclaration).specifiers.length === 0
      ) {
        path.parentPath.remove()
      }
    }
  }

  // Traverse again to remove unused references. This happens at least once,
  // then repeats until no more references are removed.
  do {
    referencesRemovedInThisPass = 0

    programPath.scope.crawl()

    programPath.traverse({
      VariableDeclarator(path) {
        if (path.node.id.type === 'Identifier') {
          const local = path.get('id') as NodePath<BabelTypes.Identifier>
          if (shouldBeRemoved(local)) {
            ++referencesRemovedInThisPass
            path.remove()
          }
        } else if (path.node.id.type === 'ObjectPattern') {
          const pattern = path.get('id') as NodePath<BabelTypes.ObjectPattern>

          const beforeCount = referencesRemovedInThisPass
          const properties = pattern.get('properties')
          properties.forEach((property) => {
            const local = property.get(
              property.node.type === 'ObjectProperty'
                ? 'value'
                : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  property.node.type === 'RestElement'
                  ? 'argument'
                  : (function () {
                      throw new Error('invariant')
                    })(),
            ) as NodePath<BabelTypes.Identifier>

            if (shouldBeRemoved(local)) {
              ++referencesRemovedInThisPass
              property.remove()
            }
          })

          if (
            beforeCount !== referencesRemovedInThisPass &&
            pattern.get('properties').length < 1
          ) {
            path.remove()
          }
        } else if (path.node.id.type === 'ArrayPattern') {
          const pattern = path.get('id') as NodePath<BabelTypes.ArrayPattern>

          let hasRemoved = false as boolean

          pattern.get('elements').forEach((element, index) => {
            // if (!element) return // Skip holes in the pattern

            let identifierPath: NodePath<BabelTypes.Identifier>

            if (t.isIdentifier(element.node)) {
              identifierPath = element as NodePath<BabelTypes.Identifier>
            } else if (t.isRestElement(element.node)) {
              identifierPath = element.get(
                'argument',
              ) as NodePath<BabelTypes.Identifier>
            } else {
              // For now, ignore other types like AssignmentPattern
              return
            }

            if (shouldBeRemoved(identifierPath)) {
              hasRemoved = true
              pattern.node.elements[index] = null // Remove the element by setting it to null
            }
          })

          // If any elements were removed and no elements are left, remove the entire declaration
          if (
            hasRemoved &&
            pattern.node.elements.every((element) => element === null)
          ) {
            path.remove()
            ++referencesRemovedInThisPass
          }
        }
      },
      FunctionDeclaration: sweepFunction,
      FunctionExpression: sweepFunction,
      ArrowFunctionExpression: sweepFunction,
      ImportSpecifier: sweepImport,
      ImportDefaultSpecifier: sweepImport,
      ImportNamespaceSpecifier: sweepImport,
    })
  } while (referencesRemovedInThisPass)
}

function getIdentifier(
  path: NodePath<
    | BabelTypes.FunctionDeclaration
    | BabelTypes.FunctionExpression
    | BabelTypes.ArrowFunctionExpression
  >,
): NodePath<BabelTypes.Identifier> | null {
  const parentPath = path.parentPath
  if (parentPath.type === 'VariableDeclarator') {
    const variablePath = parentPath as NodePath<BabelTypes.VariableDeclarator>
    const name = variablePath.get('id')
    return name.node.type === 'Identifier'
      ? (name as NodePath<BabelTypes.Identifier>)
      : null
  }

  if (parentPath.type === 'AssignmentExpression') {
    const variablePath = parentPath as NodePath<BabelTypes.AssignmentExpression>
    const name = variablePath.get('left')
    return name.node.type === 'Identifier'
      ? (name as NodePath<BabelTypes.Identifier>)
      : null
  }

  if (path.node.type === 'ArrowFunctionExpression') {
    return null
  }

  if (path.node.type === 'FunctionExpression') {
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return path.node.id && path.node.id.type === 'Identifier'
    ? (path.get('id') as NodePath<BabelTypes.Identifier>)
    : null
}

function isIdentifierReferenced(
  ident: NodePath<BabelTypes.Identifier>,
): boolean {
  const binding = ident.scope.getBinding(ident.node.name)
  if (binding?.referenced) {
    // Functions can reference themselves, so we need to check if there's a
    // binding outside the function scope or not.
    if (binding.path.type === 'FunctionDeclaration') {
      return !binding.constantViolations
        .concat(binding.referencePaths)
        // Check that every reference is contained within the function:
        .every((ref) => ref.findParent((parent) => parent === binding.path))
    }

    return true
  }
  return false
}
