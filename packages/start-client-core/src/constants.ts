export const TSS_FORMDATA_CONTEXT = '__TSS_CONTEXT'
export const TSS_SERVER_FUNCTION = Symbol.for('TSS_SERVER_FUNCTION')
export const TSS_SERVER_FUNCTION_FACTORY = Symbol.for(
  'TSS_SERVER_FUNCTION_FACTORY',
)

export const X_TSS_SERIALIZED = 'x-tss-serialized'
export const X_TSS_RAW_RESPONSE = 'x-tss-raw'

/**
 * Minimal metadata about a server function, available to client middleware.
 * Only contains the function ID since name/filename may expose server internals.
 */
export interface ClientFnMeta {
  /** The unique identifier for this server function */
  id: string
}

/**
 * Full metadata about a server function, available to server middleware.
 * This information is embedded at compile time by the TanStack Start compiler.
 */
export interface ServerFnMeta extends ClientFnMeta {
  /** The original variable name of the server function (e.g., "myServerFn") */
  name: string
  /** The source file path relative to the project root (e.g., "src/routes/api.ts") */
  filename: string
}

export {}
