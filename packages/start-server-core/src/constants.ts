export const HEADERS = {
  TSS_SHELL: 'X-TSS_SHELL',
} as const

/**
 * Own property set on the error the generated server function resolver throws
 * when an id is absent from the build's manifest.
 *
 * It is a flag on a regular `Error` rather than a distinct error type so that
 * every consumer of the resolver keeps the message and the stack; only the
 * request handler needs to recognise the case, so it can answer `404` instead
 * of letting a stale id surface as an unhandled server error.
 *
 * `@tanstack/start-plugin-core` reads this constant when it emits the resolver
 * module, so the two packages stay on one definition of the flag.
 */
export const SERVER_FN_NOT_FOUND = 'tssServerFnNotFound'

/** Whether `error` is the resolver's "no such server function id" signal. */
export function isServerFnNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>)[SERVER_FN_NOT_FOUND] === true
  )
}
