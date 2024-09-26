import * as babel from '@babel/core'
import * as t from '@babel/types'
import _generate from '@babel/generator'
import invariant from 'tiny-invariant'

import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

// Babel is a CJS package and uses `default` as named binding (`exports.default =`).
// https://github.com/babel/babel/issues/15269.
let generate = (_generate as any)['default'] as typeof _generate

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!generate) {
  generate = _generate
}

type IdentifierConfig = {
  name: string
  type: 'ImportSpecifier' | 'ImportNamespaceSpecifier'
  namespaceId: string
  handleCallExpression: (
    path: babel.NodePath<t.CallExpression>,
    identifier: IdentifierConfig,
  ) => void
  paths: Array<babel.NodePath>
}

export function compileCreateServerFnOutput(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  if (!ast) {
    throw new Error(
      `Failed to compile ast for compileCreateServerFnOutput() for the file: ${opts.filename}`,
    )
  }

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const identifiers: {
          createServerFn: IdentifierConfig
          createServerMiddleware: IdentifierConfig
        } = {
          createServerFn: {
            name: 'createServerFn',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateServerFnCallExpression,
            paths: [],
          },
          createServerMiddleware: {
            name: 'createServerMiddleware',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateServerMiddlewareCallExpression,
            paths: [],
          },
        } as const

        const identifierKeys = Object.keys(identifiers) as Array<
          keyof typeof identifiers
        >

        programPath.traverse({
          ImportDeclaration: (path) => {
            if (path.node.source.value !== '@tanstack/start') {
              return
            }

            // handle a destructured imports being renamed like "import { createServerFn as myCreateServerFn } from '@tanstack/start';"
            path.node.specifiers.forEach((specifier) => {
              identifierKeys.forEach((indentifierKey) => {
                const identifier = identifiers[indentifierKey]

                if (
                  specifier.type === 'ImportSpecifier' &&
                  specifier.imported.type === 'Identifier'
                ) {
                  if (specifier.imported.name === indentifierKey) {
                    identifier.name = specifier.local.name
                    identifier.type = 'ImportSpecifier'
                  }
                }

                // handle namespace imports like "import * as TanStackStart from '@tanstack/start';"
                if (specifier.type === 'ImportNamespaceSpecifier') {
                  identifier.type = 'ImportNamespaceSpecifier'
                  identifier.namespaceId = specifier.local.name
                  identifier.name = `${identifier.namespaceId}.${indentifierKey}`
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
                identifiers[identifierKey].paths.push(path)
              }
            })
          },
        })

        identifierKeys.forEach((identifierKey) => {
          identifiers[identifierKey].paths.forEach((path) => {
            identifiers[identifierKey].handleCallExpression(
              path as babel.NodePath<t.CallExpression>,
              identifiers[identifierKey],
            )
          })
        })
      },
    },
  })

  return generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })
}

// function addUseServerToFunction(fn: t.Node) {
//   if (t.isFunctionExpression(fn) || t.isArrowFunctionExpression(fn)) {
//     if (t.isBlockStatement(fn.body)) {
//       const hasUseServerDirective = fn.body.directives.some((directive) => {
//         return directive.value.value === 'use server'
//       })

//       if (!hasUseServerDirective) {
//         fn.body.directives.unshift(
//           t.directive(t.directiveLiteral('use server')),
//         )
//       }

//       return fn
//     }

//     if (t.isExpression(fn.body)) {
//       // If the function is an arrow function expression without a block
//       // statement, then we need to wrap the expression in a block
//       // statement with the `use server` directive at the top of the function
//       // scope.

//       const wrappedFn = t.arrowFunctionExpression(
//         fn.params,
//         t.blockStatement(
//           [t.returnStatement(fn.body)],
//           [t.directive(t.directiveLiteral('use server'))],
//         ),
//       )

//       return wrappedFn
//     }
//   } else if (t.isIdentifier(fn) || t.isCallExpression(fn)) {
//     // A function was passed to createServerFn in the form of an
//     // identifier or a call expression that returns a function.

//     // We wrap the identifier/call expression in a function
//     // expression that accepts the same arguments as the original
//     // function with the "use server" directive at the top of the
//     // function scope.

//     const args = t.restElement(t.identifier('args'))

//     const wrappedFn = t.arrowFunctionExpression(
//       [args],
//       t.blockStatement(
//         [
//           t.returnStatement(
//             t.callExpression(t.memberExpression(fn, t.identifier('apply')), [
//               t.identifier('this'),
//               t.identifier('args'),
//             ]),
//           ),
//         ],
//         [t.directive(t.directiveLiteral('use server'))],
//       ),
//     )

//     return wrappedFn
//   } else {
//     invariant(
//       false,
//       `Unexpected function type passed to createServerFn: ${fn.type}`,
//     )
//   }

//   return fn
// }

// Server functions are created using a builder style API, chained off of createServerFn.
// e.g.
// const fn = createServerFn({
//   // optional options
//   method: 'GET', // defaults to 'POST'
// })
//   .input(validatorExpression) // optional input validator
//   .handler(handlerFn)

// After it has been processed it should look like this:

// const fn = createServerFn({
//   // optional options
//   method: 'GET', // defaults to 'POST'
// })
//   .handler((...args) => {
//     'use server'
//     // The validation is optional
//     args[0].input = validatorExpression(args[0].input)
//     return handlerFn.apply(this, args)
//   })

function handleCreateServerFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  identifier: IdentifierConfig,
) {
  const importSpecifierCondition =
    path.node.callee.type === 'Identifier' &&
    path.node.callee.name === identifier.name

  const importNamespaceSpecifierCondition =
    path.node.callee.type === 'MemberExpression' &&
    path.node.callee.property.type === 'Identifier' &&
    path.node.callee.property.name === 'createServerFn'

  const shouldHandle =
    identifier.type === 'ImportSpecifier'
      ? importSpecifierCondition
      : importNamespaceSpecifierCondition

  if (shouldHandle) {
    // The function is the 'fn' property of the object passed to createServerFn

    // const firstArg = path.node.arguments[0]
    // if (t.isObjectExpression(firstArg)) {
    //   // Was called with some options
    // }

    // Traverse the member expression and find the call expressions for
    // the input, handler, and middleware methods. Check to make sure they
    // are children of the createServerFn call expression.

    const callExpressionPaths = {
      input: null as babel.NodePath<t.CallExpression> | null,
      handler: null as babel.NodePath<t.CallExpression> | null,
      middleware: null as babel.NodePath<t.CallExpression> | null,
    }

    const validMethods = Object.keys(callExpressionPaths)

    const rootCallExpression = getRootCallExpression(path)

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

    let inputExpression: t.Expression | null = null

    if (callExpressionPaths.input) {
      const innerInputExpression = callExpressionPaths.input.node.arguments[0]

      if (!innerInputExpression) {
        throw new Error(
          'createServerFn().input() must be called with an input validator!',
        )
      }

      inputExpression = t.parenthesizedExpression(innerInputExpression as any)

      if (t.isMemberExpression(callExpressionPaths.input.node.callee)) {
        callExpressionPaths.input.replaceWith(
          callExpressionPaths.input.node.callee.object,
        )
      }
    }

    // First, we need to move the handler function to a nested function call
    // that is applied to the arguments passed to the server function.

    const handlerFnPath = callExpressionPaths.handler?.get(
      'arguments.0',
    ) as babel.NodePath<any>

    if (!callExpressionPaths.handler || !handlerFnPath.node) {
      throw new Error(
        'createServerFn must be called with a "handler" property!',
      )
    }

    const handlerFn = handlerFnPath.node

    // Then, if there was an input validator, we need to validate the input
    // and assign it back to the args[0].input property before calling the
    // nested handler function.

    handlerFnPath.replaceWith(
      t.arrowFunctionExpression(
        [t.restElement(t.identifier('args'))],
        t.blockStatement(
          [
            inputExpression
              ? t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    t.memberExpression(
                      t.memberExpression(
                        t.identifier('args'),
                        t.numericLiteral(0),
                        true,
                      ),
                      t.identifier('input'),
                    ),
                    t.callExpression(inputExpression, [
                      t.memberExpression(
                        t.memberExpression(
                          t.identifier('args'),
                          t.numericLiteral(0),
                          true,
                        ),
                        t.identifier('input'),
                      ),
                    ]),
                  ),
                )
              : (null as any),
            t.returnStatement(
              t.callExpression(t.parenthesizedExpression(handlerFn), [
                t.spreadElement(t.identifier('args')),
              ]),
            ),
          ].filter(Boolean),
          // Finally, we need to ensure that our top level (...args) => {} function has a 'use server'
          // directive at the top of the function scope.
          [t.directive(t.directiveLiteral('use server'))],
        ),
      ),
    )
  }
}

function handleCreateServerMiddlewareCallExpression(
  path: babel.NodePath<t.CallExpression>,
  identifier: IdentifierConfig,
) {
  const importSpecifierCondition =
    path.node.callee.type === 'Identifier' &&
    path.node.callee.name === identifier.name

  const importNamespaceSpecifierCondition =
    path.node.callee.type === 'MemberExpression' &&
    path.node.callee.property.type === 'Identifier' &&
    path.node.callee.property.name === 'createServerMiddleware'

  const shouldHandle =
    identifier.type === 'ImportSpecifier'
      ? importSpecifierCondition
      : importNamespaceSpecifierCondition

  if (shouldHandle) {
    const firstArg = path.node.arguments[0]

    if (!t.isObjectExpression(firstArg)) {
      throw new Error(
        'createServerMiddleware must be called with an object of options!',
      )
    }

    const idProperty = firstArg.properties.find((prop) => {
      return (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'id'
      )
    })

    if (
      !idProperty ||
      !t.isObjectProperty(idProperty) ||
      !t.isStringLiteral(idProperty.value)
    ) {
      throw new Error(
        'createServerMiddleware must be called with an "id" property!',
      )
    }

    const rootCallExpression = getRootCallExpression(path)

    // Check if the call is assigned to a variable
    if (!rootCallExpression.parentPath.isVariableDeclarator()) {
      // TODO: move this logic out to eslint or something like
      // the router generator code that can do autofixes on save.

      // // If not assigned to a variable, wrap the call in a variable declaration
      // const variableDeclaration = t.variableDeclaration('const', [
      //   t.variableDeclarator(t.identifier(middlewareName), path.node),
      // ])

      // // The parent could be an expression statement, if it is, we need to replace
      // // it with the variable declaration
      // if (path.parentPath.isExpressionStatement()) {
      //   path.parentPath.replaceWith(variableDeclaration)
      // } else {
      //   // If the parent is not an expression statement, then it is a statement
      //   // that is not an expression, like a variable declaration or a return statement.
      //   // In this case, we need to insert the variable declaration before the statement
      //   path.parentPath.insertBefore(variableDeclaration)
      // }

      // // Now we need to export it. Just add an export statement
      // // to the program body
      // path.findParent((parentPath) => {
      //   if (parentPath.isProgram()) {
      //     parentPath.node.body.push(
      //       t.exportNamedDeclaration(null, [
      //         t.exportSpecifier(
      //           t.identifier(middlewareName),
      //           t.identifier(middlewareName),
      //         ),
      //       ]),
      //     )
      //   }
      //   return false
      // })

      throw new Error(
        'createServerMiddleware must be assigned to a variable and exported!',
      )
    }

    const variableDeclarator = rootCallExpression.parentPath.node
    const existingVariableName = (variableDeclarator.id as t.Identifier).name

    const program = rootCallExpression.findParent((parentPath) => {
      return parentPath.isProgram()
    }) as babel.NodePath<t.Program>

    let isExported = false as boolean

    program.traverse({
      ExportNamedDeclaration: (path) => {
        if (
          path.isExportNamedDeclaration() &&
          path.node.declaration &&
          t.isVariableDeclaration(path.node.declaration) &&
          path.node.declaration.declarations.some((decl) => {
            return (
              t.isVariableDeclarator(decl) &&
              t.isIdentifier(decl.id) &&
              decl.id.name === existingVariableName
            )
          })
        ) {
          isExported = true
        }
      },
    })

    // If not exported, export it
    if (!isExported) {
      // TODO: move this logic out to eslint or something like
      // the router generator code that can do autofixes on save.

      // path.parentPath.parentPath.insertAfter(
      //   t.exportNamedDeclaration(null, [
      //     t.exportSpecifier(
      //       t.identifier(existingVariableName),
      //       t.identifier(existingVariableName),
      //     ),
      //   ]),
      // )

      throw new Error(
        'createServerMiddleware must be exported as a named export!',
      )
    }

    // The function is the 'fn' property of the object passed to createServerFn

    // const firstArg = path.node.arguments[0]
    // if (t.isObjectExpression(firstArg)) {
    //   // Was called with some options
    // }

    // Traverse the member expression and find the call expressions for
    // the input, handler, and middleware methods. Check to make sure they
    // are children of the createServerFn call expression.

    const callExpressionPaths = {
      input: null as babel.NodePath<t.CallExpression> | null,
      use: null as babel.NodePath<t.CallExpression> | null,
      middleware: null as babel.NodePath<t.CallExpression> | null,
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

    let inputExpression: t.Expression | null = null

    if (callExpressionPaths.input) {
      const innerInputExpression = callExpressionPaths.input.node.arguments[0]

      if (!innerInputExpression) {
        throw new Error(
          'createServerFn().input() must be called with an input validator!',
        )
      }

      inputExpression = t.parenthesizedExpression(innerInputExpression as any)

      if (t.isMemberExpression(callExpressionPaths.input.node.callee)) {
        callExpressionPaths.input.replaceWith(
          callExpressionPaths.input.node.callee.object,
        )
      }
    }

    // First, we need to move the use function to a nested function call
    // that is applied to the arguments passed to the server function.

    const useFnPath = callExpressionPaths.use?.get(
      'arguments.0',
    ) as babel.NodePath<any>

    if (!callExpressionPaths.use || !useFnPath.node) {
      throw new Error('createServerFn must be called with a "use" property!')
    }

    const useFn = useFnPath.node

    // Then, if there was an input validator, we need to validate the input
    // and assign it back to the args[0].input property before calling the
    // nested use function.
    // The assignment needs to be a bit different and use
    // Object.assign(args[0].input, inputExpression(args[0].input))

    useFnPath.replaceWith(
      t.arrowFunctionExpression(
        [t.restElement(t.identifier('args'))],
        t.blockStatement(
          [
            inputExpression
              ? t.expressionStatement(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('Object'),
                      t.identifier('assign'),
                    ),
                    [
                      t.memberExpression(
                        t.memberExpression(
                          t.identifier('args'),
                          t.numericLiteral(0),
                          true,
                        ),
                        t.identifier('input'),
                      ),
                      t.callExpression(inputExpression, [
                        t.memberExpression(
                          t.memberExpression(
                            t.identifier('args'),
                            t.numericLiteral(0),
                            true,
                          ),
                          t.identifier('input'),
                        ),
                      ]),
                    ],
                  ),
                )
              : (null as any),
            t.returnStatement(
              t.callExpression(t.parenthesizedExpression(useFn), [
                t.spreadElement(t.identifier('args')),
              ]),
            ),
          ].filter(Boolean),
          // Finally, we need to ensure that our top level (...args) => {} function has a 'use server'
          // directive at the top of the function scope.
          [t.directive(t.directiveLiteral('use server'))],
        ),
      ),
    )
  }
}

function getRootCallExpression(path: babel.NodePath<t.CallExpression>) {
  // Find the highest callExpression parent
  let rootCallExpression: babel.NodePath<t.CallExpression> = path

  // Traverse up the chain of CallExpressions
  while (rootCallExpression.parentPath.isMemberExpression()) {
    const parent = rootCallExpression.parentPath
    if (parent.parentPath.isCallExpression()) {
      rootCallExpression = parent.parentPath
    }
  }

  return rootCallExpression
}
