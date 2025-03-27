import * as babel from '@babel/core'
import * as t from '@babel/types'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import {
  getRootCallExpression,
  handleClientOnlyCallExpression,
  handleCreateIsomorphicFnCallExpression,
  handleCreateMiddlewareCallExpression,
  handleCreateServerFnCallExpression,
  handleServerOnlyCallExpression,
} from '@tanstack/start-plugin-core'
import type {
  CompileOptions,
  IdentifierConfig,
} from '@tanstack/start-plugin-core'
import type { GeneratorResult } from '@tanstack/router-utils'

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

  const manifest = { middleware: false, methods: {} as any }

  Object.entries(callExpressionPaths).forEach(([key, callPath]) => {
    if (callPath && t.isMemberExpression(callPath.node.callee)) {
      if (key === 'middleware') {
        manifest.middleware = true
      } else if (key === 'methods') {
        // Get the methods object from the methods call
        const methodsArg = callPath.node.arguments[0]

        // Handle the case where methods is a function that returns an object
        if (
          t.isArrowFunctionExpression(methodsArg) &&
          t.isObjectExpression(methodsArg.body)
        ) {
          methodsArg.body.properties.forEach((prop) => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const methodName = prop.key.name
              manifest.methods[methodName] = {
                validator: false,
                middleware: false,
              }

              // Check if this method has a validator or middleware
              if (t.isCallExpression(prop.value)) {
                const method = prop.value
                method.arguments.forEach((arg) => {
                  if (t.isObjectExpression(arg)) {
                    arg.properties.forEach((methodProp) => {
                      if (
                        t.isObjectProperty(methodProp) &&
                        t.isIdentifier(methodProp.key)
                      ) {
                        if (methodProp.key.name === 'validator') {
                          manifest.methods[methodName].validator = true
                        }
                        if (methodProp.key.name === 'middleware') {
                          manifest.methods[methodName].middleware = true
                        }
                      }
                    })
                  }
                })
              }
            }
          })
        }
        // Handle the case where methods is a direct object
        else if (t.isObjectExpression(methodsArg)) {
          methodsArg.properties.forEach((prop) => {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const methodName = prop.key.name
              manifest.methods[methodName] = {
                validator: false,
                middleware: false,
              }
            }
          })
        }
      }

      if (opts.env === 'client') {
        callPath.replaceWith(callPath.node.callee.object)
      }
    }
  })

  console.log(manifest)

  path.replaceWith(
    t.callExpression(t.identifier('createServerFileRoute'), [
      t.identifier('undefined'),
      t.callExpression(
        t.memberExpression(t.identifier('Object'), t.identifier('assign')),
        [
          t.objectExpression(
            path.node.arguments
              .map((arg) => {
                if (t.isIdentifier(arg)) {
                  return t.objectProperty(t.identifier(arg.name), arg)
                }
                // Handle other cases or return a default value if necessary
                return null // or throw an error, or handle accordingly
              })
              .filter(
                (property): property is t.ObjectProperty => property !== null,
              ),
          ),
          t.objectExpression([
            t.objectProperty(t.identifier('manifest'), t.valueToNode(manifest)),
          ]),
        ],
      ),
    ]),
  )

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
