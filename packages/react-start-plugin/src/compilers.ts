import * as babel from '@babel/core'
import * as t from '@babel/types'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import type { GeneratorResult } from '@tanstack/router-utils'
import { CompileOptions, getRootCallExpression, IdentifierConfig } from '@tanstack/start-plugin-core'
import {
  handleServerOnlyCallExpression,
  handleClientOnlyCallExpression,
  handleCreateServerFnCallExpression,
  handleCreateMiddlewareCallExpression,
  handleCreateIsomorphicFnCallExpression
} from '@tanstack/start-plugin-core'

export function compileStartOutput(opts: CompileOptions): GeneratorResult {
  const ast = parseAst(opts)

  const doDce = opts.dce ?? true
  // find referenced identifiers *before* we transform anything
  const refIdents = doDce ? findReferencedIdentifiers(ast) : undefined

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const identifiers: {
          createServerFileRoute: IdentifierConfig
          createServerFn: IdentifierConfig
          createMiddleware: IdentifierConfig
          serverOnly: IdentifierConfig
          clientOnly: IdentifierConfig
          createIsomorphicFn: IdentifierConfig
        } = {
          createServerFileRoute: {
            name: 'createServerFileRoute',
            handleCallExpression: handleCreateServerFileRouteCallExpression,
            paths: [],
          },
          createServerFn: {
            name: 'createServerFn',
            handleCallExpression: handleCreateServerFnCallExpression,
            paths: [],
          },
          createMiddleware: {
            name: 'createMiddleware',
            handleCallExpression: handleCreateMiddlewareCallExpression,
            paths: [],
          },
          serverOnly: {
            name: 'serverOnly',
            handleCallExpression: handleServerOnlyCallExpression,
            paths: [],
          },
          clientOnly: {
            name: 'clientOnly',
            handleCallExpression: handleClientOnlyCallExpression,
            paths: [],
          },
          createIsomorphicFn: {
            name: 'createIsomorphicFn',
            handleCallExpression: handleCreateIsomorphicFnCallExpression,
            paths: [],
          },
        }

        const identifierKeys = Object.keys(identifiers) as Array<
          keyof typeof identifiers
        >

        programPath.traverse({
          ImportDeclaration: (path) => {
            if (
              path.node.source.value !== '@tanstack/react-start' &&
              path.node.source.value !== '@tanstack/solid-start'
            ) {
              return
            }

            // handle a destructured imports being renamed like "import { createServerFn as myCreateServerFn } from '@tanstack/react-start';"
            path.node.specifiers.forEach((specifier) => {
              identifierKeys.forEach((identifierKey) => {
                const identifier = identifiers[identifierKey]

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
            identifierKeys.forEach((identifierKey) => {
              // Check to see if the call expression is a call to the
              // identifiers[identifierKey].name
              if (
                t.isIdentifier(path.node.callee) &&
                path.node.callee.name === identifiers[identifierKey].name
              ) {
                // The identifier could be a call to the original function
                // in the source code. If this is case, we need to ignore it.
                // Check the scope to see if the identifier is a function declaration.
                // if it is, then we can ignore it.

                if (
                  path.scope.getBinding(identifiers[identifierKey].name)?.path
                    .node.type === 'FunctionDeclaration'
                ) {
                  return
                }

                return identifiers[identifierKey].paths.push(path)
              }

              if (t.isMemberExpression(path.node.callee)) {
                if (
                  t.isIdentifier(path.node.callee.object) &&
                  t.isIdentifier(path.node.callee.property)
                ) {
                  const callname = [
                    path.node.callee.object.name,
                    path.node.callee.property.name,
                  ].join('.')

                  if (callname === identifiers[identifierKey].name) {
                    identifiers[identifierKey].paths.push(path)
                  }
                }
              }

              return
            })
          },
        })

        identifierKeys.forEach((identifierKey) => {
          identifiers[identifierKey].paths.forEach((path) => {
            identifiers[identifierKey].handleCallExpression(
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

function handleCreateServerFileRouteCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  let highestParent: babel.NodePath<any> = path

  while (highestParent.parentPath && !highestParent.parentPath.isProgram()) {
    highestParent = highestParent.parentPath
  }

  const programPath = highestParent.parentPath as babel.NodePath<t.Program>

  // Find the root call expression and all of the methods that are called on it
  const rootCallExpression = getRootCallExpression(path)

  const callExpressionPaths = {
    validator: null as babel.NodePath<t.CallExpression> | null,
    middleware: null as babel.NodePath<t.CallExpression> | null,
    methods: null as babel.NodePath<t.CallExpression> | null,
  }

  const validMethods = Object.keys(callExpressionPaths)

  rootCallExpression.traverse({
    MemberExpression(memberExpressionPath) {
      if (t.isIdentifier(memberExpressionPath.node.property)) {
        const name = memberExpressionPath.node.property
          .name as keyof typeof callExpressionPaths

        if (
          validMethods.includes(name) &&
          memberExpressionPath.parentPath.isCallExpression()
        ) {
          callExpressionPaths[name] = memberExpressionPath.parentPath
        }
      }
    },
  })

  // On the client, remove validator, middleware and methods calls by replacing them with their object
  if (opts.env === 'client') {
    Object.values(callExpressionPaths).forEach((callPath) => {
      if (callPath && t.isMemberExpression(callPath.node.callee)) {
        callPath.replaceWith(callPath.node.callee.object)
      }
    })
  }

  let isCreateServerFileRouteImported = false as boolean

  programPath.traverse({
    ImportDeclaration(importPath) {
      const importSource = importPath.node.source.value
      if (importSource === '@tanstack/react-start') {
        const specifiers = importPath.node.specifiers
        isCreateServerFileRouteImported = specifiers.some((specifier) => {
          return (
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported) &&
            specifier.imported.name === 'createServerFileRoute'
          )
        })
      }
    },
  })

  if (!isCreateServerFileRouteImported) {
    const importDeclaration = t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier('createServerFileRoute'),
          t.identifier('createServerFileRoute'),
        ),
      ],
      t.stringLiteral('@tanstack/react-start'),
    )
    programPath.node.body.unshift(importDeclaration)
  }
}