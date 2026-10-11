import { b, is } from 'yuku-ast'
import type { CompilationContext, RewriteCandidate } from './types'

export function handleCreateIsomorphicFn(
  candidates: Array<RewriteCandidate>,
  context: CompilationContext,
): void {
  for (const { node, methodChain } of candidates) {
    const selected =
      context.env === 'client' ? methodChain.client : methodChain.server
    if (!selected) {
      context.replaceNode(node, isomorphicStub())
      continue
    }
    if (!is.Expression(selected.firstArg)) {
      throw new Error(
        `createIsomorphicFn().${context.env}(func) must be called with a function!`,
      )
    }
    context.replaceNode(node, selected.firstArg)
  }
}

/** `() => {}` */
export function isomorphicStub() {
  return b.ArrowFunctionExpression({
    id: null,
    generator: false,
    async: false,
    expression: false,
    params: [],
    body: b.BlockStatement({ body: [] }),
  })
}
