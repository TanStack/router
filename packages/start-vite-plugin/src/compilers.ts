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
          },
          createServerMiddleware: {
            name: 'createServerMiddleware',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateServerMiddlewareCallExpression,
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
              identifiers[identifierKey].handleCallExpression(
                path,
                identifiers[identifierKey],
              )
            })
          },
        })
      },
    },
  })

  return generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })
}

function addUseServerToFunction(fn: t.Node) {
  if (t.isFunctionExpression(fn) || t.isArrowFunctionExpression(fn)) {
    if (t.isBlockStatement(fn.body)) {
      const hasUseServerDirective = fn.body.directives.some((directive) => {
        return directive.value.value === 'use server'
      })

      if (!hasUseServerDirective) {
        fn.body.directives.unshift(
          t.directive(t.directiveLiteral('use server')),
        )
      }

      return fn
    }

    if (t.isExpression(fn.body)) {
      // If the function is an arrow function expression without a block
      // statement, then we need to wrap the expression in a block
      // statement with the `use server` directive at the top of the function
      // scope.

      const wrappedFn = t.arrowFunctionExpression(
        fn.params,
        t.blockStatement(
          [t.returnStatement(fn.body)],
          [t.directive(t.directiveLiteral('use server'))],
        ),
      )

      return wrappedFn
    }
  } else if (t.isIdentifier(fn) || t.isCallExpression(fn)) {
    // A function was passed to createServerFn in the form of an
    // identifier or a call expression that returns a function.

    // We wrap the identifier/call expression in a function
    // expression that accepts the same arguments as the original
    // function with the "use server" directive at the top of the
    // function scope.

    const args = t.restElement(t.identifier('args'))

    const wrappedFn = t.arrowFunctionExpression(
      [args],
      t.blockStatement(
        [
          t.returnStatement(
            t.callExpression(t.memberExpression(fn, t.identifier('apply')), [
              t.identifier('this'),
              t.identifier('args'),
            ]),
          ),
        ],
        [t.directive(t.directiveLiteral('use server'))],
      ),
    )

    return wrappedFn
  } else {
    invariant(
      false,
      `Unexpected function type passed to createServerFn: ${fn.type}`,
    )
  }

  return fn
}

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

    const firstArg = path.node.arguments[0]
    if (!t.isObjectExpression(firstArg)) {
      throw new Error(
        'createServerFn must be called with an object of options!',
      )
    }

    // Extract the server function
    const fnProperty = firstArg.properties.find((prop) => {
      return (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'fn'
      )
    })

    if (!t.isObjectProperty(fnProperty)) {
      // TODO: move this logic out to eslint or something like
      // the router generator code that can do autofixes on save.

      // // Stub in a fake fn: () => {} property so we can continue

      // fnProperty = t.objectProperty(
      //   t.identifier('fn'),
      //   t.arrowFunctionExpression([], t.blockStatement([])),
      // )

      // firstArg.properties.push(fnProperty)

      throw new Error('createServerFn must be called with an "fn" property!')
    }

    fnProperty.value = addUseServerToFunction(fnProperty.value)

    // Extract the validator into a function with the `use server` directive
    // that returns the validator value.

    const validatorProperty = firstArg.properties.find((prop) => {
      return (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'serverValidator'
      )
    }) as t.ObjectProperty | undefined

    // If we find a validator property, then we need to use it to validate
    // the input to the server function before calling the server function.

    // like this:
    // fn: (...args) => {
    //    'use server' // directive should be here allready
    //     args[0].payload = validator(args[0].payload)
    //    return ((...args) => {
    //      // original function body
    //    })(...args)
    // },

    // Then we need to remove the validator property from the object

    if (validatorProperty) {
      const validator = validatorProperty.value

      // Remove the validator property from the object
      firstArg.properties = firstArg.properties.filter((prop) => {
        return prop !== validatorProperty
      })

      // create a new function that wraps the original function

      const payloadExpression = t.memberExpression(
        t.memberExpression(t.identifier('args'), t.numericLiteral(0), true),
        t.identifier('payload'),
      )

      // Walk down fnProperty.value and remove any 'use server' directives.
      // We only want the top level function to have the 'use server' directive.

      let current = fnProperty.value as any

      while (t.isArrowFunctionExpression(current)) {
        if (t.isBlockStatement(current.body)) {
          current.body.directives = current.body.directives.filter(
            (directive) => {
              return directive.value.value !== 'use server'
            },
          )

          break
        }

        current = current.body
      }

      const wrappedFn = t.arrowFunctionExpression(
        [t.restElement(t.identifier('args'))],
        t.blockStatement(
          [
            //  args[0].payload = (validator)(args[0].payload)
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                payloadExpression,
                t.callExpression(t.parenthesizedExpression(validator as any), [
                  payloadExpression,
                ]),
              ),
            ),
            t.returnStatement(
              t.callExpression(
                t.parenthesizedExpression(fnProperty.value as any),
                [t.spreadElement(t.identifier('args'))],
              ),
            ),
          ],
          [t.directive(t.directiveLiteral('use server'))],
        ),
      )

      fnProperty.value = wrappedFn
    }
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

    // Check if the call is assigned to a variable
    if (!path.parentPath.isVariableDeclarator()) {
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

    const variableDeclarator = path.parentPath.node
    const existingVariableName = (variableDeclarator.id as t.Identifier).name

    const program = path.findParent((parentPath) => {
      return parentPath.isProgram()
    }) as babel.NodePath<t.Program>

    let isExported = false as boolean

    program.traverse({
      ExportNamedDeclaration: (path) => {
        //         {
        //   type: 'ExportNamedDeclaration',
        //   start: 82,
        //   end: 405,
        //   loc: SourceLocation {
        //     start: Position { line: 4, column: 0, index: 82 },
        //     end: Position { line: 13, column: 2, index: 405 },
        //     filename: undefined,
        //     identifierName: undefined
        //   },
        //   exportKind: 'value',
        //   specifiers: [],
        //   source: null,
        //   declaration: Node {
        //     type: 'VariableDeclaration',
        //     start: 89,
        //     end: 405,
        //     loc: SourceLocation {
        //       start: [Position],
        //       end: [Position],
        //       filename: undefined,
        //       identifierName: undefined
        //     },
        //     declarations: [ [Node] ],
        //     kind: 'const'
        //   }
        // }

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

    // Extract the server function
    const beforeProperty = firstArg.properties.find((prop) => {
      return (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'before'
      )
    })

    const afterProperty = firstArg.properties.find((prop) => {
      return (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'after'
      )
    })

    ;[beforeProperty, afterProperty].filter(Boolean).forEach((fnProperty) => {
      if (t.isObjectProperty(fnProperty)) {
        const fn = fnProperty.value
        fnProperty.value = addUseServerToFunction(fn)
      }
    })
  }
}
