import * as babel from '@babel/core'
import * as t from '@babel/types'
import _generate from '@babel/generator'
import invariant from 'tiny-invariant'
import { codeFrameColumns } from '@babel/code-frame'

import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

// Babel is a CJS package and uses `default` as named binding (`exports.default =`).
// https://github.com/babel/babel/issues/15269.
let generate = (_generate as any)['default'] as typeof _generate

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!generate) {
  generate = _generate
}

const debug = process.env.TSR_VITE_DEBUG === 'true'

type IdentifierConfig = {
  name: string
  type: 'ImportSpecifier' | 'ImportNamespaceSpecifier'
  namespaceId: string
  handleCallExpression: (
    path: babel.NodePath<t.CallExpression>,
    opts: ParseAstOptions,
  ) => void
  paths: Array<babel.NodePath>
}

export function compileStartOutput(opts: ParseAstOptions) {
  const ast = parseAst(opts)

  if (!ast) {
    throw new Error(
      `Failed to compile ast for compileStartOutput() for the file: ${opts.filename}`,
    )
  }

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const identifiers: {
          createServerFn: IdentifierConfig
          createServerMiddleware: IdentifierConfig
          serverOnly: IdentifierConfig
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
          serverOnly: {
            name: 'serverOnly',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleServerOnlyCallExpression,
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

  return generate(ast, {
    sourceMaps: true,
    minified: process.env.NODE_ENV === 'production',
  })
}

function handleCreateServerFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: ParseAstOptions,
) {
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

  if (debug)
    console.info(
      'Handling createServerFn call expression:',
      rootCallExpression.toString(),
    )

  // Check if the call is assigned to a variable
  if (!rootCallExpression.parentPath.isVariableDeclarator()) {
    throw new Error('createServerFn must be assigned to a variable!')
  }

  // Get the identifier name of the variable
  const variableDeclarator = rootCallExpression.parentPath.node
  const existingVariableName = (variableDeclarator.id as t.Identifier).name

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
    throw codeFrameError(
      opts.code,
      path.node.callee.loc!,
      `createServerFn must be called with a "handler" property!`,
    )
  }

  const handlerFn = handlerFnPath.node

  // So, the way we do this is we give the handler function a way
  // to access the serverFn ctx on the server via function scope.
  // The 'use server' extracted function will be called with the
  // payload from the client, then use the scoped serverFn ctx
  // to execute the handler function.
  // This way, we can do things like input and middleware validation
  // in the __execute function without having to AST transform the
  // handler function too much itself.

  // .handler((optsOut, ctx) => {
  //   return ((optsIn) => {
  //     'use server'
  //     ctx.__execute(handlerFn, optsIn)
  //   })(optsOut)
  // })

  removeUseServerDirective(handlerFnPath)

  handlerFnPath.replaceWith(
    t.arrowFunctionExpression(
      [t.identifier('opts')],
      t.blockStatement(
        // Everything in here is server-only, since the client
        // will strip out anything in the 'use server' directive.
        [
          t.returnStatement(
            t.callExpression(
              t.identifier(`${existingVariableName}.__execute`),
              [t.identifier('opts')],
            ),
          ),
        ],
        [t.directive(t.directiveLiteral('use server'))],
      ),
    ),
  )

  // If we're on the server, add the original handler function to the
  // arguments of the handler function call.

  if (opts.env === 'server') {
    callExpressionPaths.handler.node.arguments.push(handlerFn)
  }
}

function removeUseServerDirective(path: babel.NodePath<any>) {
  path.traverse({
    Directive(path) {
      if (path.node.value.value === 'use server') {
        path.remove()
      }
    },
  })
}

function handleCreateServerMiddlewareCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: ParseAstOptions,
) {
  // const firstArg = path.node.arguments[0]

  // if (!t.isObjectExpression(firstArg)) {
  //   throw new Error(
  //     'createServerMiddleware must be called with an object of options!',
  //   )
  // }

  // const idProperty = firstArg.properties.find((prop) => {
  //   return (
  //     t.isObjectProperty(prop) &&
  //     t.isIdentifier(prop.key) &&
  //     prop.key.name === 'id'
  //   )
  // })

  // if (
  //   !idProperty ||
  //   !t.isObjectProperty(idProperty) ||
  //   !t.isStringLiteral(idProperty.value)
  // ) {
  //   throw new Error(
  //     'createServerMiddleware must be called with an "id" property!',
  //   )
  // }

  const rootCallExpression = getRootCallExpression(path)

  if (debug)
    console.info(
      'Handling createServerMiddleware call expression:',
      rootCallExpression.toString(),
    )

  // Check if the call is assigned to a variable
  // if (!rootCallExpression.parentPath.isVariableDeclarator()) {
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

  //   throw new Error(
  //     'createServerMiddleware must be assigned to a variable and exported!',
  //   )
  // }

  // const variableDeclarator = rootCallExpression.parentPath.node
  // const existingVariableName = (variableDeclarator.id as t.Identifier).name

  // const program = rootCallExpression.findParent((parentPath) => {
  //   return parentPath.isProgram()
  // }) as babel.NodePath<t.Program>

  // let isExported = false as boolean

  // program.traverse({
  //   ExportNamedDeclaration: (path) => {
  //     if (
  //       path.isExportNamedDeclaration() &&
  //       path.node.declaration &&
  //       t.isVariableDeclaration(path.node.declaration) &&
  //       path.node.declaration.declarations.some((decl) => {
  //         return (
  //           t.isVariableDeclarator(decl) &&
  //           t.isIdentifier(decl.id) &&
  //           decl.id.name === existingVariableName
  //         )
  //       })
  //     ) {
  //       isExported = true
  //     }
  //   },
  // })

  // If not exported, export it
  // if (!isExported) {
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

  //   throw new Error(
  //     'createServerMiddleware must be exported as a named export!',
  //   )
  // }

  // The function is the 'fn' property of the object passed to createServerMiddleware

  // const firstArg = path.node.arguments[0]
  // if (t.isObjectExpression(firstArg)) {
  //   // Was called with some options
  // }

  // Traverse the member expression and find the call expressions for
  // the input, handler, and middleware methods. Check to make sure they
  // are children of the createServerMiddleware call expression.

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

  if (callExpressionPaths.input) {
    const innerInputExpression = callExpressionPaths.input.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createServerMiddleware().input() must be called with an input validator!',
      )
    }

    // If we're on the client, remove the input call expression
    if (opts.env === 'client') {
      if (t.isMemberExpression(callExpressionPaths.input.node.callee)) {
        callExpressionPaths.input.replaceWith(
          callExpressionPaths.input.node.callee.object,
        )
      }
    }
  }

  const useFnPath = callExpressionPaths.use?.get(
    'arguments.0',
  ) as babel.NodePath<any>

  if (!callExpressionPaths.use || !useFnPath.node) {
    throw new Error(
      'createServerMiddleware must be called with a "use" property!',
    )
  }

  // If we're on the client, remove the use call expression

  if (opts.env === 'client') {
    if (t.isMemberExpression(callExpressionPaths.use.node.callee)) {
      callExpressionPaths.use.replaceWith(
        callExpressionPaths.use.node.callee.object,
      )
    }
  }
}

function handleServerOnlyCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: ParseAstOptions,
) {
  if (debug)
    console.info('Handling serverOnly call expression:', path.toString())

  if (opts.env === 'server') {
    // Do nothing on the server.
    return
  }

  // If we're on the client, replace the call expression with a function
  // that has a single always-triggering invariant.

  path.replaceWith(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.identifier('invariant'), [
            t.booleanLiteral(false),
            t.stringLiteral(
              'serverOnly() functions can only be called on the server!',
            ),
          ]),
        ),
      ]),
    ),
  )
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

function codeFrameError(
  code: string,
  loc: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  },
  message: string,
) {
  const frame = codeFrameColumns(
    code,
    {
      start: loc.start,
      end: loc.end,
    },
    {
      highlightCode: true,
      message,
    },
  )

  return new Error(frame)
}
