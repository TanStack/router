import { stripMethodCall } from './utils'
import type { CompilationContext, RewriteCandidate } from './types'

/**
 * Handles createMiddleware transformations for a batch of candidates.
 *
 * @param candidates - All Middleware candidates to process
 * @param context - The compilation context
 */
export function handleCreateMiddleware(
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
): void {
  if (context.env === 'server') {
    throw new Error('handleCreateMiddleware should not be called on the server')
  }

  for (const candidate of candidates) {
    const { inputValidator, server } = candidate.methodChain

    if (inputValidator) {
      const innerInputExpression = inputValidator.callPath.node.arguments[0]

      if (!innerInputExpression) {
        throw new Error(
          'createMiddleware().inputValidator() must be called with a validator!',
        )
      }

      // remove the validator call expression
      stripMethodCall(inputValidator.callPath)
    }

    if (server) {
      // remove the server call expression
      stripMethodCall(server.callPath)
    }
  }
}
