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
 * violation is one warning for the module (`invariantWarning`).
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

/** `v`, when the run warns; in our test runs, throws its detail. */
export function invariantViolated(v: InvariantViolation): InvariantViolation {
  if (SELF_CHECKS) {
    throw new Error(v.detail)
  }
  return v
}

/** The warning for a module whose compile violated an invariant (`tag` with its space, `file` as messages name it). */
export function invariantWarning(
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
