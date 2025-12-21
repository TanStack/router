import * as t from '@babel/types'
import type { RewriteCandidate } from './types'

/**
 * Handles createMiddleware transformations.
 *
 * @param candidate - The rewrite candidate containing path and method chain
 * @param opts - Options including the environment
 */
export function handleCreateMiddleware(
  candidate: RewriteCandidate,
  opts: {
    env: 'client' | 'server'
  },
) {
  if (opts.env === 'server') {
    throw new Error('handleCreateMiddleware should not be called on the server')
  }

  const { inputValidator, server } = candidate.methodChain

  if (inputValidator) {
    const innerInputExpression = inputValidator.callPath.node.arguments[0]

    if (!innerInputExpression) {
      throw new Error(
        'createMiddleware().inputValidator() must be called with a validator!',
      )
    }

    // remove the validator call expression
    if (t.isMemberExpression(inputValidator.callPath.node.callee)) {
      inputValidator.callPath.replaceWith(
        inputValidator.callPath.node.callee.object,
      )
    }
  }

  if (server && server.firstArgPath?.node) {
    // remove the server call expression
    if (t.isMemberExpression(server.callPath.node.callee)) {
      server.callPath.replaceWith(server.callPath.node.callee.object)
    }
  }
}
