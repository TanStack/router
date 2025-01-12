import * as babel from '@babel/core'
import * as t from '@babel/types'
import _generate from '@babel/generator'
import { codeFrameColumns } from '@babel/code-frame'
import {
  deadCodeElimination,
  findReferencedIdentifiers,
} from 'babel-dead-code-elimination'

import { parseAst } from './ast'
import type { ParseAstOptions } from './ast'

// Babel is a CJS package and uses `default` as named binding (`exports.default =`).
// https://github.com/babel/babel/issues/15269.
let generate = (_generate as any)['default'] as typeof _generate

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (!generate) {
  generate = _generate
}

export function compileEliminateDeadCode(
  opts: ParseAstOptions,
  idents: ReturnType<typeof findReferencedIdentifiers> | undefined,
) {
  const ast = parseAst(opts)
  deadCodeElimination(ast, idents)
  return generate(ast, {
    sourceMaps: true,
    filename: opts.filename,
  })
}

const debug = process.env.TSR_VITE_DEBUG === 'true'

// build these once and reuse them
const handleServerOnlyCallExpression =
  buildEnvOnlyCallExpressionHandler('server')
const handleClientOnlyCallExpression =
  buildEnvOnlyCallExpressionHandler('client')

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

  // get all the identifiers referenced in the source code *before* we start
  // so we can use them for DCE later
  const idents = findReferencedIdentifiers(ast)

  babel.traverse(ast, {
    Program: {
      enter(programPath) {
        const identifiers: {
          createServerFn: IdentifierConfig
          createMiddleware: IdentifierConfig
          serverOnly: IdentifierConfig
          clientOnly: IdentifierConfig
          createIsomorphicFn: IdentifierConfig
        } = {
          createServerFn: {
            name: 'createServerFn',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateServerFnCallExpression,
            paths: [],
          },
          createMiddleware: {
            name: 'createMiddleware',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateMiddlewareCallExpression,
            paths: [],
          },
          serverOnly: {
            name: 'serverOnly',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleServerOnlyCallExpression,
            paths: [],
          },
          clientOnly: {
            name: 'clientOnly',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleClientOnlyCallExpression,
            paths: [],
          },
          createIsomorphicFn: {
            name: 'createIsomorphicFn',
            type: 'ImportSpecifier',
            namespaceId: '',
            handleCallExpression: handleCreateIsomorphicFnCallExpression,
            paths: [],
          },
        }

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
              identifierKeys.forEach((identifierKey) => {
                const identifier = identifiers[identifierKey]

                if (
                  specifier.type === 'ImportSpecifier' &&
                  specifier.imported.type === 'Identifier'
                ) {
                  if (specifier.imported.name === identifierKey) {
                    identifier.name = specifier.local.name
                    identifier.type = 'ImportSpecifier'
                  }
                }

                // handle namespace imports like "import * as TanStackStart from '@tanstack/start';"
                if (specifier.type === 'ImportNamespaceSpecifier') {
                  identifier.type = 'ImportNamespaceSpecifier'
                  identifier.namespaceId = specifier.local.name
                  identifier.name = `${identifier.namespaceId}.${identifierKey}`
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

  return {
    idents,
    compiled: generate(ast, {
      sourceMaps: true,
      filename: opts.filename,
      minified: process.env.NODE_ENV === 'production',
    }),
  }
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
  // the validator, handler, and middleware methods. Check to make sure they
  // are children of the createServerFn call expression.

  const calledOptions = path.node.arguments[0]
    ? (path.get('arguments.0') as babel.NodePath<t.ObjectExpression>)
    : null

  const shouldValidateClient = !!calledOptions?.node.properties.find((prop) => {
    return (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      prop.key.name === 'validateClient' &&
      t.isBooleanLiteral(prop.value) &&
      prop.value.value === true
    )
  })

  const callExpressionPaths = {
    middleware: null as babel.NodePath<t.CallExpression> | null,
    validator: null as babel.NodePath<t.CallExpression> | null,
    handler: null as babel.NodePath<t.CallExpression> | null,
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

  if (callExpressionPaths.validator) {
    const innerInputExpression = callExpressionPaths.validator.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createServerFn().validator() must be called with a validator!',
      )
    }

    // If we're on the client, and we're not validating the client, remove the validator call expression
    if (
      opts.env === 'client' &&
      !shouldValidateClient &&
      t.isMemberExpression(callExpressionPaths.validator.node.callee)
    ) {
      callExpressionPaths.validator.replaceWith(
        callExpressionPaths.validator.node.callee.object,
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
  // This way, we can do things like data and middleware validation
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
              t.identifier(`${existingVariableName}.__executeServer`),
              [t.identifier('opts')],
            ),
          ),
        ],
        [t.directive(t.directiveLiteral('use server'))],
      ),
    ),
  )

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

function handleCreateMiddlewareCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: ParseAstOptions,
) {
  // const firstArg = path.node.arguments[0]

  // if (!t.isObjectExpression(firstArg)) {
  //   throw new Error(
  //     'createMiddleware must be called with an object of options!',
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
  //     'createMiddleware must be called with an "id" property!',
  //   )
  // }

  const rootCallExpression = getRootCallExpression(path)

  if (debug)
    console.info(
      'Handling createMiddleware call expression:',
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
  //     'createMiddleware must be assigned to a variable and exported!',
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
  //     'createMiddleware must be exported as a named export!',
  //   )
  // }

  // The function is the 'fn' property of the object passed to createMiddleware

  // const firstArg = path.node.arguments[0]
  // if (t.isObjectExpression(firstArg)) {
  //   // Was called with some options
  // }

  // Traverse the member expression and find the call expressions for
  // the validator, handler, and middleware methods. Check to make sure they
  // are children of the createMiddleware call expression.

  const callExpressionPaths = {
    middleware: null as babel.NodePath<t.CallExpression> | null,
    validator: null as babel.NodePath<t.CallExpression> | null,
    client: null as babel.NodePath<t.CallExpression> | null,
    server: null as babel.NodePath<t.CallExpression> | null,
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

  if (callExpressionPaths.validator) {
    const innerInputExpression = callExpressionPaths.validator.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createMiddleware().validator() must be called with a validator!',
      )
    }

    // If we're on the client, remove the validator call expression
    if (opts.env === 'client') {
      if (t.isMemberExpression(callExpressionPaths.validator.node.callee)) {
        callExpressionPaths.validator.replaceWith(
          callExpressionPaths.validator.node.callee.object,
        )
      }
    }
  }

  const useFnPath = callExpressionPaths.server?.get(
    'arguments.0',
  ) as babel.NodePath<any>

  if (!callExpressionPaths.server || !useFnPath.node) {
    throw new Error('createMiddleware must be called with a "use" property!')
  }

  // If we're on the client, remove the use call expression

  if (opts.env === 'client') {
    if (t.isMemberExpression(callExpressionPaths.server.node.callee)) {
      callExpressionPaths.server.replaceWith(
        callExpressionPaths.server.node.callee.object,
      )
    }
  }
}

function buildEnvOnlyCallExpressionHandler(env: 'client' | 'server') {
  return function envOnlyCallExpressionHandler(
    path: babel.NodePath<t.CallExpression>,
    opts: ParseAstOptions,
  ) {
    if (debug)
      console.info(`Handling ${env}Only call expression:`, path.toString())

    if (opts.env === env) {
      // extract the inner function from the call expression
      const innerInputExpression = path.node.arguments[0]

      if (!t.isExpression(innerInputExpression)) {
        throw new Error(
          `${env}Only() functions must be called with a function!`,
        )
      }

      path.replaceWith(innerInputExpression)
      return
    }

    // If we're on the wrong environment, replace the call expression
    // with a function that always throws an error.
    path.replaceWith(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.throwStatement(
            t.newExpression(t.identifier('Error'), [
              t.stringLiteral(
                `${env}Only() functions can only be called on the ${env}!`,
              ),
            ]),
          ),
        ]),
      ),
    )
  }
}

function handleCreateIsomorphicFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: ParseAstOptions,
) {
  const rootCallExpression = getRootCallExpression(path)

  if (debug)
    console.info(
      'Handling createIsomorphicFn call expression:',
      rootCallExpression.toString(),
    )

  const callExpressionPaths = {
    client: null as babel.NodePath<t.CallExpression> | null,
    server: null as babel.NodePath<t.CallExpression> | null,
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

  if (
    validMethods.every(
      (method) =>
        !callExpressionPaths[method as keyof typeof callExpressionPaths],
    )
  ) {
    const variableId = rootCallExpression.parentPath.isVariableDeclarator()
      ? rootCallExpression.parentPath.node.id
      : null
    console.warn(
      'createIsomorphicFn called without a client or server implementation!',
      'This will result in a no-op function.',
      'Variable name:',
      t.isIdentifier(variableId) ? variableId.name : 'unknown',
    )
  }

  const envCallExpression = callExpressionPaths[opts.env]

  if (!envCallExpression) {
    // if we don't have an implementation for this environment, default to a no-op
    rootCallExpression.replaceWith(
      t.arrowFunctionExpression([], t.blockStatement([])),
    )
    return
  }

  const innerInputExpression = envCallExpression.node.arguments[0]

  if (!t.isExpression(innerInputExpression)) {
    throw new Error(
      `createIsomorphicFn().${opts.env}(func) must be called with a function!`,
    )
  }

  rootCallExpression.replaceWith(innerInputExpression)
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
