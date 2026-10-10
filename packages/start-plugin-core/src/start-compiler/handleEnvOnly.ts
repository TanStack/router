import { is } from 'yuku-ast'
import { parseExpression } from '@tanstack/router-utils'
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
        parseExpression(
          `() => { throw new Error(${JSON.stringify(`${factory}() functions can only be called on the ${target}!`)}); }`,
        ),
      )
    }
  }
}
