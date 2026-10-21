/**
 * The completion of an edit, by its outcome (SPEC G10, J3.6; coupling N21):
 * the edit is applied (what a user sees: the page shows it, the output holds
 * it), the hosts have nothing of it in flight, no problem ends it early, and
 * one overall timeout bounds the wait. Never by how a compiler gets there:
 * how many file events, compiles, hot updates or `vite:afterUpdate` events
 * an edit takes, or how soon after the first one the edit shows, are the
 * compiler's business (a valid update may come in two phases, or as a full
 * reload).
 */

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
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Resolves once the outcome holds and the hosts are quiet, checked twice in
 * a row (a host that goes quiet for an instant between two steps of the
 * same edit is not done); rejects with a problem as soon as one shows, at
 * the timeout, or (`failWhenQuietFor`) once the hosts stayed quiet that long
 * without the outcome.
 */
export async function waitForOutcome(wait: OutcomeWait): Promise<void> {
  const deadline = Date.now() + wait.timeout
  let settledChecks = 0
  /** Since when, and for how many checks, the hosts were quiet without the outcome. */
  let quietWithout: { since: number; checks: number } | undefined
  for (;;) {
    const problems = wait.problems?.() ?? []
    if (problems.length > 0) {
      throw new Error(
        `the edit failed: ${problems.join('\n')}\n${await wait.describe()}`,
      )
    }
    const applied = await wait.applied()
    const quiet = await (wait.quiet?.() ?? true)
    const done = applied && quiet && (await wait.applied())
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
        throw new Error(
          `the edit reached its final state without its outcome: the hosts had nothing of it in flight for ${wait.failWhenQuietFor} ms\n${await wait.describe()}`,
        )
      }
    } else {
      quietWithout = undefined
    }
    if (Date.now() > deadline) {
      throw new Error(
        `the edit did not reach its outcome within ${wait.timeout} ms\n${await wait.describe()}`,
      )
    }
    await sleep(25)
  }
}
