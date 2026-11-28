/**
 * The compiler's self-checks, behind one switch: `TSR_COMPILER_VERIFY=1`,
 * read once, here. Our own test runs set it (compiler-test-utils'
 * run-directory setup, router-utils' test config, the fuzz harness), so it
 * is on in the oracle, the package suites and CI. Never `NODE_ENV=test`:
 * users run their own tests through these plugins.
 *
 * On: every output is re-parsed and verified (`verify.ts`), the internal
 * asserts run, and a violated invariant throws. Off (users' dev servers and
 * builds, production included): the invariants are still checked, and a
 * violation is one warning for the module (`invariantDiagnostic`).
 */
import type { Diagnostic } from './diagnostics'

export const SELF_CHECKS = process.env.TSR_COMPILER_VERIFY === '1'

/** A compiler invariant that does not hold: only a compiler bug gets here. */
export interface InvariantViolation {
  /** What may be wrong in the output, one short clause for the warning. */
  effect: string
  /** The internal detail, the message our test runs throw. */
  detail: string
  /** Where in the module, when known. */
  range?: { start: number; end: number }
}

/** `v`, when the run reports it; in our test runs, throws its detail. */
export function invariantViolated(v: InvariantViolation): InvariantViolation {
  if (SELF_CHECKS) {
    throw internalError(v.detail)
  }
  return v
}

const INTERNAL = Symbol.for('tanstack.compiler.internal-error')

/**
 * The error of a failed internal assertion (only a compiler bug throws it),
 * `detail` its message: the compile's caller gets it as an internal
 * compiler error to report (`reportedError`).
 */
export function internalError(detail: string): Error {
  return Object.assign(new Error(detail), { [INTERNAL]: true })
}

/**
 * What a failed compile of `file` (as messages name it) throws to its
 * caller: an internal compiler error (`internalError`) as one a user can act
 * on (report it, with the file), its detail and its stack after that; any other
 * error (a host's, a plugin's) as it is.
 */
export function reportedError(
  error: unknown,
  tag: string,
  file: string,
): unknown {
  if (!(error instanceof Error) || !(INTERNAL in error)) {
    return error
  }
  const message = `${tag}Internal compiler error in ${file}. Please report it at https://github.com/TanStack/router/issues with this file and the detail below.\n${error.message}`
  // (no `cause`: the detail is in the message, which a host would print twice)
  const reported = new Error(message)
  const frames = error.stack?.indexOf('\n    at ') ?? -1
  reported.stack =
    frames < 0 ? message : `${message}${error.stack!.slice(frames)}`
  return reported
}

/** The diagnostic of a module whose compile violated an invariant (`tag` with its space, `file` as messages name it). */
export function invariantDiagnostic(
  tag: string,
  file: string,
  v: InvariantViolation,
): Diagnostic {
  return {
    severity: 'warning',
    message: `${tag}Internal compiler error in ${file}: the compiled output may be wrong (${v.effect}). Please report it at https://github.com/TanStack/router/issues with this file.`,
    range: v.range,
    by: 'core',
    code: 'internal-invariant',
  }
}
