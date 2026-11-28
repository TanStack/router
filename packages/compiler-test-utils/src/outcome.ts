/**
 * The completion of an edit, by its outcome (SPEC G10, J3.6):
 * the edit is applied (what a user sees: the page shows it, the output holds
 * it), the hosts have nothing of it in flight, no problem ends it early, and
 * one overall timeout bounds the wait. Never by how a compiler gets there:
 * how many file events, compiles, hot updates or `vite:afterUpdate` events
 * an edit takes, or how soon after the first one the edit shows, are the
 * compiler's business (a valid update may come in two phases, or as a full
 * reload).
 *
 * An edit that ends without its outcome (a problem, or the hosts quiet
 * without it: `failWhenQuietFor`) fails as an assertion, with what was
 * expected and what was seen; the overall timeout is a `SettleTimeout` (the
 * wait could not tell).
 */
import { AssertionError } from 'node:assert'

/**
 * A wait that ran out of time (for an edit's outcome, a build, a page, a
 * program): not the outcome it waited for. Every wait of the harness throws
 * it at its bound, and a host that turns build failures into its own error
 * lets it through (`settleTimeoutIn`), so a row that expects a failure cannot
 * pass on something that never settled.
 */
export class SettleTimeout extends Error {
  override name = 'SettleTimeout'
}

/**
 * The `SettleTimeout` that `error` is or carries, if any: as its `cause`, or
 * as a bundler wraps a plugin's error (Rolldown's `errors`, webpack's
 * `error`, esbuild's `errors[].detail`). Rspack passes on an error thrown in
 * a hook it calls from native code (`make`, ...) as its message only: none
 * is found there.
 */
export function settleTimeoutIn(
  error: unknown,
  seen = new Set<unknown>(),
): SettleTimeout | undefined {
  if (error instanceof SettleTimeout) {
    return error
  }
  // (an error may be among its own causes)
  seen.add(error)
  const {
    cause,
    error: inner,
    detail,
    errors,
  } = (error as Record<string, unknown> | null | undefined) ?? {}
  return [cause, inner, detail, ...(Array.isArray(errors) ? errors : [])]
    .filter((wrapped) => typeof wrapped === 'object' && !seen.has(wrapped))
    .map((wrapped) => settleTimeoutIn(wrapped, seen))
    .find((found) => found !== undefined)
}

export interface OutcomeWait {
  /** Whether the edit's outcome holds now (e.g. the page shows the edit). */
  applied: () => boolean | Promise<boolean>
  /**
   * Whether the hosts have nothing of the edit in flight now (e.g. the dev
   * server has no transform pending and the page no request open); checked
   * once `applied` holds, and `applied` again after it. Default: quiet.
   */
  quiet?: () => boolean | Promise<boolean>
  /** Problems that end the wait at once, as a failure (default: none). */
  problems?: () => Array<string>
  /** The overall bound, in milliseconds. */
  timeout: number
  /**
   * Ends the wait as a failure once the hosts have stayed quiet this long
   * (milliseconds, and at least five checks) while the outcome does not
   * hold: nothing of the edit is in flight any more, so it reached its final
   * state without the outcome. Only for a wait that starts once the hosts
   * handled the edit (e.g. after the dev server's settle), with a `quiet`
   * that covers every host (a step of the edit still to come is work in
   * flight somewhere). Default: wait for the outcome until `timeout`.
   */
  failWhenQuietFor?: number
  /** What the failure reports (the state seen last). */
  describe: () => string | Promise<string>
  /**
   * What the outcome expects and what the hosts show now (e.g. the page's
   * text), for the assertion an edit without its outcome fails with (a
   * diff of the two).
   */
  observed?: () =>
    | { actual: unknown; expected: unknown }
    | Promise<{ actual: unknown; expected: unknown }>
}

/** How long a failure may take to read the hosts' state, at most. */
const describeBound = 1_000

/** `answer`, or `undefined` when it does not settle within `ms`. */
async function settledWithin<T>(
  answer: () => T | Promise<T>,
  ms: number,
): Promise<{ value: T } | undefined> {
  if (ms <= 0) {
    return undefined
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const answered = Promise.resolve().then(answer)
  // (an answer that comes after the bound is no one's)
  answered.catch(() => {})
  try {
    return await Promise.race([
      answered.then((value) => ({ value })),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolves once the outcome holds and the hosts are quiet, checked twice in
 * a row (a host that goes quiet for an instant between two steps of the
 * same edit is not done); rejects with a problem as soon as one shows, at
 * the timeout, or (`failWhenQuietFor`) once the hosts stayed quiet that long
 * without the outcome. The timeout bounds the whole wait: a check that has
 * not answered by then (a dev server that never goes idle) ends it, and one
 * that answers after it counts for nothing. A failure reads the hosts'
 * state (`describe`, `observed`) for at most a second.
 */
export async function waitForOutcome(wait: OutcomeWait): Promise<void> {
  const deadline = Date.now() + wait.timeout
  const description = async () =>
    (await settledWithin(wait.describe, describeBound))?.value ??
    `(the hosts' state could not be read within ${describeBound} ms)`
  const timedOut = async () =>
    new SettleTimeout(
      `the edit did not reach its outcome within ${wait.timeout} ms\n${await description()}`,
    )
  /** A check's answer, before the deadline. */
  const check = async <T>(answer: () => T | Promise<T>) => {
    const answered = await settledWithin(answer, deadline - Date.now())
    // (an answer read after the deadline, e.g. by a check that kept the
    // event loop past it, counts for nothing either)
    if (answered === undefined || Date.now() > deadline) {
      throw await timedOut()
    }
    return answered.value
  }
  let settledChecks = 0
  /** Since when, and for how many checks, the hosts were quiet without the outcome. */
  let quietWithout: { since: number; checks: number } | undefined
  for (;;) {
    const problems = wait.problems?.() ?? []
    if (problems.length > 0) {
      throw new AssertionError({
        message: `the edit failed: ${problems.join('\n')}\n${await description()}`,
        actual: problems,
        expected: [],
        operator: 'deepStrictEqual',
      })
    }
    const applied = await check(wait.applied)
    const quiet = await check(() => wait.quiet?.() ?? true)
    const done = applied && quiet && (await check(wait.applied))
    settledChecks = done ? settledChecks + 1 : 0
    if (settledChecks >= 2) {
      return
    }
    if (wait.failWhenQuietFor !== undefined && !applied && quiet) {
      quietWithout ??= { since: Date.now(), checks: 0 }
      quietWithout.checks++
      if (
        quietWithout.checks >= 5 &&
        Date.now() - quietWithout.since >= wait.failWhenQuietFor
      ) {
        const observed = wait.observed
          ? (await settledWithin(wait.observed, describeBound))?.value
          : undefined
        throw new AssertionError({
          message: `the edit reached its final state without its outcome: the hosts had nothing of it in flight for ${wait.failWhenQuietFor} ms\n${await description()}`,
          ...(observed && {
            actual: observed.actual,
            expected: observed.expected,
            operator: 'strictEqual',
          }),
        })
      }
    } else {
      quietWithout = undefined
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw await timedOut()
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(25, remaining)),
    )
  }
}
