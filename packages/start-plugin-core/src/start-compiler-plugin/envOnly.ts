import * as t from '@babel/types'
import type * as babel from '@babel/core'

import type { CompileOptions } from './compilers'

export function buildEnvOnlyCallExpressionHandler(env: 'client' | 'server') {
  return function envOnlyCallExpressionHandler(
    path: babel.NodePath<t.CallExpression>,
    opts: CompileOptions,
  ) {
    // if (debug)
    //   console.info(`Handling ${env}Only call expression:`, path.toString())

    const isEnvMatch =
      env === 'client' ? opts.env === 'client' : opts.env === 'server'

    if (isEnvMatch) {
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
