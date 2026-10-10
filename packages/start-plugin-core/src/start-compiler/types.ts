import type { CallExpression } from '@yuku-toolchain/types'
import type { StartCompilerTransformContext } from '../types'

/**
 * Context passed to all plugin handlers during compilation.
 * Contains both read-only input data and mutable state that handlers update.
 */
export interface CompilationContext extends StartCompilerTransformContext {
  /** Generate a unique function ID */
  generateFunctionId: GenerateFunctionIdFn
  /** Get known server functions from previous builds (e.g., client build) */
  getKnownServerFns: () => Record<string, ServerFn>
  /** Module-level directives to add to extracted server function provider files. */
  serverFnProviderModuleDirectives: ReadonlyArray<string> | undefined

  /**
   * Callback when server functions are discovered.
   * Called after each file is compiled with its new functions.
   */
  onServerFnsById: ((d: Record<string, ServerFn>) => void) | undefined
}

/**
 * Info about a method call in the chain, including the call expression
 * and its first argument (if any).
 */
export interface MethodCallInfo {
  call: CallExpression
  /** First argument, or null if no arguments. */
  firstArg: CallExpression['arguments'][number] | null
}

/**
 * Pre-collected native method-chain nodes for a root call expression.
 * This avoids needing to traverse the AST again in handlers.
 */
export interface MethodChain {
  middleware: MethodCallInfo | null
  validator: MethodCallInfo | null
  // TODO remove upon stable
  inputValidator: MethodCallInfo | null
  handler: MethodCallInfo | null
  server: MethodCallInfo | null
  client: MethodCallInfo | null
}

/**
 * Information about a candidate that needs to be rewritten.
 */
export interface RewriteCandidate {
  node: CallExpression
  methodChain: MethodChain
}

/**
 * Represents an extracted server function that has been registered.
 * Used for manifest generation and tracking function metadata.
 */
export interface ServerFn {
  /** The unique name used to export this function */
  functionName: string
  /** The unique ID for this function (used in RPC calls) */
  functionId: string
  /** The filename with query param where the extracted implementation lives */
  extractedFilename: string
  /** The original source filename */
  filename: string
  /**
   * True when this function was discovered by the client build.
   * Used to restrict HTTP access to only client-referenced functions.
   */
  isClientReferenced?: boolean
}

/**
 * Function type for generating unique function IDs.
 */
export type GenerateFunctionIdFn = (opts: {
  filename: string
  functionName: string
  extractedFilename: string
}) => string

/**
 * Optional version that allows returning undefined to use default ID generation.
 */
export type GenerateFunctionIdFnOptional = (
  opts: Omit<Parameters<GenerateFunctionIdFn>[0], 'extractedFilename'>,
) => string | undefined

/**
 * Encodes the extracted module specifier used in development server function IDs.
 */
export type DevServerFnModuleSpecifierEncoder = (opts: {
  extractedFilename: string
  root: string
}) => string
