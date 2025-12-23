import * as t from '@babel/types'
import type { RewriteCandidate } from './types'

export function handleCreateIsomorphicFn(
  candidate: RewriteCandidate,
  opts: { env: 'client' | 'server' },
) {
  const { path, methodChain } = candidate

  // Get the environment-specific call (.client() or .server())
  const envCallInfo =
    opts.env === 'client' ? methodChain.client : methodChain.server

  // Check if we have any implementation at all
  if (!methodChain.client && !methodChain.server) {
    // No implementations provided - warn and replace with no-op
    const variableId = path.parentPath.isVariableDeclarator()
      ? path.parentPath.node.id
      : null
    console.warn(
      'createIsomorphicFn called without a client or server implementation!',
      'This will result in a no-op function.',
      'Variable name:',
      t.isIdentifier(variableId) ? variableId.name : 'unknown',
    )
    path.replaceWith(t.arrowFunctionExpression([], t.blockStatement([])))
    return
  }

  if (!envCallInfo) {
    // No implementation for this environment - replace with no-op
    path.replaceWith(t.arrowFunctionExpression([], t.blockStatement([])))
    return
  }

  // Extract the function argument from the environment-specific call
  const innerFn = envCallInfo.firstArgPath?.node

  if (!t.isExpression(innerFn)) {
    throw new Error(
      `createIsomorphicFn().${opts.env}(func) must be called with a function!`,
    )
  }

  path.replaceWith(innerFn)
}
