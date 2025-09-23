import * as t from '@babel/types'
import { getRootCallExpression } from '../start-compiler-plugin/utils'
import type * as babel from '@babel/core'

export function handleCreateMiddleware(
  path: babel.NodePath<t.CallExpression>,
  opts: {
    env: 'client' | 'server'
  },
) {
  const rootCallExpression = getRootCallExpression(path)

  // if (debug)
  //   console.info(
  //     'Handling createMiddleware call expression:',
  //     rootCallExpression.toString(),
  //   )

  const callExpressionPaths = {
    middleware: null as babel.NodePath<t.CallExpression> | null,
    inputValidator: null as babel.NodePath<t.CallExpression> | null,
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

  if (callExpressionPaths.inputValidator) {
    const innerInputExpression =
      callExpressionPaths.inputValidator.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createMiddleware().inputValidator() must be called with a validator!',
      )
    }

    // If we're on the client, remove the validator call expression
    if (opts.env === 'client') {
      if (
        t.isMemberExpression(callExpressionPaths.inputValidator.node.callee)
      ) {
        callExpressionPaths.inputValidator.replaceWith(
          callExpressionPaths.inputValidator.node.callee.object,
        )
      }
    }
  }

  const serverFnPath = callExpressionPaths.server?.get(
    'arguments.0',
  ) as babel.NodePath<any>

  if (
    callExpressionPaths.server &&
    serverFnPath.node &&
    opts.env === 'client'
  ) {
    // If we're on the client, remove the server call expression
    if (t.isMemberExpression(callExpressionPaths.server.node.callee)) {
      callExpressionPaths.server.replaceWith(
        callExpressionPaths.server.node.callee.object,
      )
    }
  }
}
