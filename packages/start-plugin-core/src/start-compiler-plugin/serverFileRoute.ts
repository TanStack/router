import * as t from '@babel/types'
import type * as babel from '@babel/core'

import type { CompileOptions, CompileStartFrameworkOptions } from './compilers'

export function handleCreateServerFileRouteCallExpressionFactory(
  framework: CompileStartFrameworkOptions,
  method:
    | 'createServerFileRoute'
    | 'createServerRoute'
    | 'createServerRootRoute',
) {
  return function handleCreateServerFileRouteCallExpression(
    path: babel.NodePath<t.CallExpression>,
    opts: CompileOptions,
  ) {
    const PACKAGES = { start: `@tanstack/${framework}-start/server` }

    let highestParent: babel.NodePath<any> = path

    while (highestParent.parentPath && !highestParent.parentPath.isProgram()) {
      highestParent = highestParent.parentPath
    }

    const programPath = highestParent.parentPath as babel.NodePath<t.Program>

    // If we're on the client, remove the entire variable
    if (opts.env === 'client') {
      highestParent.remove()
      return
    }

    let isCreateServerFileRouteImported = false as boolean

    programPath.traverse({
      ImportDeclaration(importPath) {
        const importSource = importPath.node.source.value
        if (importSource === PACKAGES.start) {
          const specifiers = importPath.node.specifiers
          isCreateServerFileRouteImported ||= specifiers.some((specifier) => {
            return (
              t.isImportSpecifier(specifier) &&
              t.isIdentifier(specifier.imported) &&
              specifier.imported.name === method
            )
          })
        }
      },
    })

    if (!isCreateServerFileRouteImported) {
      const importDeclaration = t.importDeclaration(
        [t.importSpecifier(t.identifier(method), t.identifier(method))],
        t.stringLiteral(PACKAGES.start),
      )
      programPath.node.body.unshift(importDeclaration)
    }
  }
}
