import * as t from '@babel/types'
import { stripMethodCall } from './utils'
import type { CompilationContext, RewriteCandidate } from './types'

const HAS_SERVER_KEY = 'hasServer'

/**
 * Handles createMiddleware transformations.
 * - client: strips `.server()` and marks client-only middleware with `hasServer: false`
 * - server: keeps runtime code unchanged
 */
export function handleCreateMiddleware(
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
): void {
  for (const candidate of candidates) {
    const { inputValidator, server } = candidate.methodChain

    if (inputValidator && context.env === 'client') {
      const innerInputExpression = inputValidator.callPath.node.arguments[0]

      if (!innerInputExpression) {
        throw new Error(
          'createMiddleware().inputValidator() must be called with a validator!',
        )
      }

      stripMethodCall(inputValidator.callPath)
    }

    if (context.env === 'client') {
      if (server) {
        stripMethodCall(server.callPath)
      } else {
        const args =
          candidate.rootPath?.get('arguments') ??
          candidate.path.get('arguments')
        const firstArg = Array.isArray(args) && args.length > 0 ? args[0] : null

        if (firstArg?.isObjectExpression()) {
          const hasExistingKey = firstArg.node.properties.some((property) => {
            return (
              t.isObjectProperty(property) &&
              t.isIdentifier(property.key) &&
              property.key.name === HAS_SERVER_KEY
            )
          })

          if (!hasExistingKey) {
            firstArg.node.properties.push(
              t.objectProperty(
                t.identifier(HAS_SERVER_KEY),
                t.booleanLiteral(false),
              ),
            )
          }
        } else {
          const targetPath = candidate.rootPath ?? candidate.path
          targetPath.node.arguments = [
            t.objectExpression([
              t.objectProperty(
                t.identifier(HAS_SERVER_KEY),
                t.booleanLiteral(false),
              ),
            ]),
          ]
        }
      }
    }
  }
}
