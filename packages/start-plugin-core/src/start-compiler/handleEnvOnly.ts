import { b, is } from 'yuku-ast'
import { generatedReference, stringLiteral } from './utils'
import type { CompilationContext, RewriteCandidate } from './types'
import type { LookupKind } from './compiler'

export function handleEnvOnlyFn(
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
  kind: LookupKind,
): void {
  const target = kind === 'ClientOnlyFn' ? 'client' : 'server'
  const factory = `create${target[0]!.toUpperCase()}${target.slice(1)}OnlyFn`
  for (const { node } of candidates) {
    if (context.env === target) {
      const argument = node.arguments[0]
      if (!is.Expression(argument)) {
        throw new Error(`${factory}() must be called with a function!`)
      }
      context.replaceNode(node, argument)
    } else {
      context.replaceNode(
        node,
        b.ArrowFunctionExpression({
          id: null,
          generator: false,
          async: false,
          expression: false,
          params: [],
          body: b.BlockStatement({
            body: [
              b.ThrowStatement({
                argument: b.NewExpression({
                  callee: generatedReference('Error'),
                  arguments: [
                    stringLiteral(
                      `${factory}() functions can only be called on the ${target}!`,
                    ),
                  ],
                }),
              }),
            ],
          }),
        }),
      )
    }
  }
}
