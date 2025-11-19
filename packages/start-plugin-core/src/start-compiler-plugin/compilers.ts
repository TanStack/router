import * as babel from '@babel/core'
import * as t from '@babel/types'

import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import { handleCreateMiddleware } from '../create-server-fn-plugin/handleCreateMiddleware'
import { transformFuncs } from './constants'
import { handleCreateIsomorphicFnCallExpression } from './isomorphicFn'
import {
  handleCreateClientOnlyFnCallExpression,
  handleCreateServerOnlyFnCallExpression,
} from './envOnly'
import type { GeneratorResult, ParseAstOptions } from '@tanstack/router-utils'

export type CompileStartFrameworkOptions = 'react' | 'solid'

type Identifiers = { [K in (typeof transformFuncs)[number]]: IdentifierConfig }

export function compileStartOutputFactory(
  framework: CompileStartFrameworkOptions,
) {
  return function compileStartOutput(opts: CompileOptions): GeneratorResult {
    const identifiers: Partial<Identifiers> = {
      createServerOnlyFn: {
        name: 'createServerOnlyFn',
        handleCallExpression: handleCreateServerOnlyFnCallExpression,
        paths: [],
      },
      createClientOnlyFn: {
        name: 'createClientOnlyFn',
        handleCallExpression: handleCreateClientOnlyFnCallExpression,
        paths: [],
      },
      createIsomorphicFn: {
        name: 'createIsomorphicFn',
        handleCallExpression: handleCreateIsomorphicFnCallExpression,
        paths: [],
      },
    }

    // createMiddleware only performs modifications in the client environment
    // so we can avoid executing this on the server
    if (opts.env === 'client') {
      identifiers.createMiddleware = {
        name: 'createMiddleware',
        handleCallExpression: handleCreateMiddleware,
        paths: [],
      }
    }

    const ast = parseAst(opts)

    const doDce = opts.dce ?? true
    // find referenced identifiers *before* we transform anything
    const refIdents = doDce ? findReferencedIdentifiers(ast) : undefined

    const validImportSources = [
      `@tanstack/${framework}-start`,
      '@tanstack/start-client-core',
    ]
    babel.traverse(ast, {
      Program: {
        enter(programPath) {
          programPath.traverse({
            ImportDeclaration: (path) => {
              if (!validImportSources.includes(path.node.source.value)) {
                return
              }

              // handle a destructured imports being renamed like "import { createServerFn as myCreateServerFn } from '@tanstack/react-start';"
              path.node.specifiers.forEach((specifier) => {
                transformFuncs.forEach((identifierKey) => {
                  const identifier = identifiers[identifierKey]
                  if (!identifier) {
                    return
                  }
                  if (
                    specifier.type === 'ImportSpecifier' &&
                    specifier.imported.type === 'Identifier'
                  ) {
                    if (specifier.imported.name === identifierKey) {
                      identifier.name = specifier.local.name
                    }
                  }

                  // handle namespace imports like "import * as TanStackStart from '@tanstack/react-start';"
                  if (specifier.type === 'ImportNamespaceSpecifier') {
                    identifier.name = `${specifier.local.name}.${identifierKey}`
                  }
                })
              })
            },
            CallExpression: (path) => {
              transformFuncs.forEach((identifierKey) => {
                const identifier = identifiers[identifierKey]
                if (!identifier) {
                  return
                }
                // Check to see if the call expression is a call to the
                // identifiers[identifierKey].name
                if (
                  t.isIdentifier(path.node.callee) &&
                  path.node.callee.name === identifier.name
                ) {
                  // The identifier could be a call to the original function
                  // in the source code. If this is case, we need to ignore it.
                  // Check the scope to see if the identifier is a function declaration.
                  // if it is, then we can ignore it.

                  if (
                    path.scope.getBinding(identifier.name)?.path.node.type ===
                    'FunctionDeclaration'
                  ) {
                    return
                  }

                  return identifier.paths.push(path)
                }

                // handle namespace imports like "import * as TanStackStart from '@tanstack/react-start';"
                // which are then called like "TanStackStart.createServerFn()"
                if (t.isMemberExpression(path.node.callee)) {
                  if (
                    t.isIdentifier(path.node.callee.object) &&
                    t.isIdentifier(path.node.callee.property)
                  ) {
                    const callname = [
                      path.node.callee.object.name,
                      path.node.callee.property.name,
                    ].join('.')

                    if (callname === identifier.name) {
                      identifier.paths.push(path)
                    }
                  }
                }

                return
              })
            },
          })

          transformFuncs.forEach((identifierKey) => {
            const identifier = identifiers[identifierKey]
            if (!identifier) {
              return
            }
            identifier.paths.forEach((path) => {
              identifier.handleCallExpression(
                path as babel.NodePath<t.CallExpression>,
                opts,
              )
            })
          })
        },
      },
    })

    if (doDce) {
      deadCodeElimination(ast, refIdents)
    }

    return generateFromAst(ast, {
      sourceMaps: true,
      sourceFileName: opts.filename,
      filename: opts.filename,
    })
  }
}

export type CompileOptions = ParseAstOptions & {
  env: 'server' | 'client'
  dce?: boolean
  filename: string
}

export type IdentifierConfig = {
  name: string
  handleCallExpression: (
    path: babel.NodePath<t.CallExpression>,
    opts: CompileOptions,
  ) => void
  paths: Array<babel.NodePath>
}
