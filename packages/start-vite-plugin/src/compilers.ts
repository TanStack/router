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
    // If the function at createServerFn({
    //   fn: () => {
    //      // directive should be here
    //   },
    // })
    // doesn't have a 'use server' directive at the top of the function scope,
    // then add it.

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
      throw new Error(
        'createServerFn must be called with an object with a "fn" property!',
      )
    }

    const fn = fnProperty.value

    fnProperty.value = addUseServerToFunction(fn)

    // Extract the validator into a function with the `use server` directive
    // that returns the validator value.

    const validatorProperty = firstArg.properties.find((prop) => {
      return t.isIdentifier(prop.key) && prop.key.name === 'serverValidator'
    })

    // The validator won't be a function,  so we literally
    // just need to wrap it in a function that returns the value, but with
    // the `use server` directive at the top of the function scope.

    if (validatorProperty) {
      const validator = validatorProperty.value

      const wrappedValidator = t.arrowFunctionExpression(
        [],
        t.blockStatement(
          [t.returnStatement(validator)],
          [t.directive(t.directiveLiteral('use server'))],
        ),
      )

      validatorProperty.value = wrappedValidator
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
    // If the function at createServerMiddleware({
    //   fn: () => {
    //      // directive should be here
    //   },
    // })
    // doesn't have a 'use server' directive at the top of the function scope,
    // then add it.

    // The function is the 'fn' property of the object passed to createServerMiddleware

    const firstArg = path.node.arguments[0]
    if (!t.isObjectExpression(firstArg)) {
      throw new Error(
        'createServerMiddleware must be called with an object of options!',
      )
    }

    const idProperty = firstArg.properties.find((prop) => {
      return t.isIdentifier(prop.key) && prop.key.name === 'id'
    })

    if (!t.isStringLiteral(idProperty.value)) {
      throw new Error(
        'createServerMiddleware must be called with an "id" property!',
      )
    }

    // Extract the server function
    const beforeProperty = firstArg.properties.find((prop) => {
      return t.isIdentifier(prop.key) && prop.key.name === 'before'
    })

    const afterProperty = firstArg.properties.find((prop) => {
      return t.isIdentifier(prop.key) && prop.key.name === 'after'
    })

    //
    ;[beforeProperty, afterProperty]
      .filter(Boolean)
      .forEach((fnProperty: t.ObjectProperty) => {
        const fn = fnProperty.value
        fnProperty.value = addUseServerToFunction(fn)
      })

    // Extract the validator into a function with the `use server` directive
    // that returns the validator value.

    const validatorProperty = firstArg.properties.find((prop) => {
      return t.isIdentifier(prop.key) && prop.key.name === 'serverValidator'
    })

    // The validator won't be a function,  so we literally
    // just need to wrap it in a function that returns the value, but with
    // the `use server` directive at the top of the function scope.

    if (validatorProperty) {
      const validator = validatorProperty.value

      const wrappedValidator = t.arrowFunctionExpression(
        [],
        t.blockStatement(
          [t.returnStatement(validator)],
          [t.directive(t.directiveLiteral('use server'))],
        ),
      )

      validatorProperty.value = wrappedValidator
    }
  }
}
