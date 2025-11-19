import * as t from '@babel/types'
import { getRootCallExpression } from './utils'
import type * as babel from '@babel/core'

import type { CompileOptions } from './compilers'

export function handleCreateIsomorphicFnCallExpression(
  path: babel.NodePath<t.CallExpression>,
  opts: CompileOptions,
) {
  const rootCallExpression = getRootCallExpression(path)

  // if (debug)
  //   console.info(
  //     'Handling createIsomorphicFn call expression:',
  //     rootCallExpression.toString(),
  //   )

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
