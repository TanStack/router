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
    const { validator, server } = candidate.methodChain

    if (validator) {
      const innerInputExpression = validator.call.arguments[0]

      if (!innerInputExpression) {
        throw new Error(
          'createMiddleware().validator() must be called with a validator!',
        )
      }

      // remove the validator call expression
      stripMethodCall(validator.call, context)
    }

    if (server) {
      // remove the server call expression
      stripMethodCall(server.call, context)
    }
  }
}
