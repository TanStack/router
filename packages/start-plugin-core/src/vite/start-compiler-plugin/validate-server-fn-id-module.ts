import { resolve as resolvePath } from 'pathe'
import { SERVER_FN_LOOKUP } from '../../constants'
import { decodeViteDevServerModuleSpecifier } from './module-specifier'
import type { ServerFn } from '../../start-compiler/types'

export interface ValidateServerFnIdContext {
  serverFnsById: Record<string, ServerFn>
  root: string
  environment: {
    mode: string
    transformRequest: (id: string) => Promise<unknown>
  }
  /** Rollup's `this.error` throws, so it never returns. */
  error: (message: string) => never
}

/**
 * Dev-only server-function id validation shared with the Vite plugin. An unknown
 * id ends in `Invalid server function ID`, which the dev `getServerFnById` wrapper
 * flags with `SERVER_FN_NOT_FOUND` so the handler answers 404. A failed source
 * transform is a real build error and must propagate untouched, otherwise a broken
 * source file would be reported as a missing id (404) and hide the build failure.
 */
export async function validateServerFnId(
  fnId: string | undefined,
  ctx: ValidateServerFnIdContext,
): Promise<string> {
  const { serverFnsById, root, environment, error } = ctx

  if (fnId && serverFnsById[fnId]) {
    return `export {}`
  }

  // ID not yet registered — the source file may not have been transformed in this
  // dev session yet (e.g. cold restart with cached client). Try to decode the ID,
  // discover the source file, trigger its compilation, and re-check.
  if (fnId) {
    // Only decoding the id may legitimately fail (a stale/malformed id): keep that
    // inside the try. The source transform below must NOT be caught here — a failed
    // transform is a real build error and has to propagate, otherwise a broken
    // source file is reported as a missing id (404) and the build failure is hidden.
    let decoded: { file?: unknown; export?: unknown } | undefined
    try {
      decoded = JSON.parse(Buffer.from(fnId, 'base64url').toString('utf8'))
    } catch {
      // Malformed id — fall through to the missing-id error.
      decoded = undefined
    }

    if (
      decoded &&
      typeof decoded.file === 'string' &&
      typeof decoded.export === 'string'
    ) {
      // Use the Vite encoder to decode the module specifier back to the
      // original source file path.
      const sourceFile = decodeViteDevServerModuleSpecifier(decoded.file)

      if (sourceFile) {
        const absPath = resolvePath(root, sourceFile)

        if (environment.mode !== 'dev') {
          error(
            `could not validate server function ID ${fnId}: unknown environment mode ${environment.mode}`,
          )
        }

        // Trigger transform of the source file in this environment, which
        // compiles createServerFn calls and populates serverFnsById. A transform
        // failure rejects here and propagates untouched.
        await environment.transformRequest(`${absPath}?${SERVER_FN_LOOKUP}`)

        // Re-check after lazy compilation
        if (serverFnsById[fnId]) {
          return `export {}`
        }
      }
    }
  }

  return error(`Invalid server function ID: ${fnId}`)
}
