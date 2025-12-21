import type * as babel from '@babel/core'
import type * as t from '@babel/types'

/**
 * Info about a method call in the chain, including the call expression path
 * and the path to its first argument (if any).
 */
export interface MethodCallInfo {
  callPath: babel.NodePath<t.CallExpression>
  /** Path to the first argument, or null if no arguments */
  firstArgPath: babel.NodePath | null
}

/**
 * Pre-collected method chain paths for a root call expression.
 * This avoids needing to traverse the AST again in handlers.
 */
export interface MethodChainPaths {
  middleware: MethodCallInfo | null
  inputValidator: MethodCallInfo | null
  handler: MethodCallInfo | null
  server: MethodCallInfo | null
  client: MethodCallInfo | null
}

export type MethodChainKey = keyof MethodChainPaths

export const METHOD_CHAIN_KEYS: ReadonlyArray<MethodChainKey> = [
  'middleware',
  'inputValidator',
  'handler',
  'server',
  'client',
] as const

/**
 * Information about a candidate that needs to be rewritten.
 */
export interface RewriteCandidate {
  path: babel.NodePath<t.CallExpression>
  methodChain: MethodChainPaths
}
