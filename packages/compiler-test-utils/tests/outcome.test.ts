/**
 * Controls of the edit completion by outcome (outcome.ts): the wait
 * ends once the outcome holds with the hosts quiet, however many steps the
 * edit took and however late after the first one it shows; it fails at
 * its one bound, or at once on a problem. The old page wait failed a
 * correct two-phase update 500 ms after the first applied update.
 */
import { describe, expect, test } from 'vitest'
import { SettleTimeout, settleTimeoutIn, waitForOutcome } from '../src/outcome'

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('waitForOutcome', () => {
  test('a two-phase update whose outcome shows late (after 600 ms) completes', async () => {
    let shows = false
    // First phase: something applied, nothing to see yet; second phase
    // shows the edit
    setTimeout(() => {
      shows = true
    }, 600)
    await waitForOutcome({
      timeout: 5_000,
      applied: () => shows,
      describe: () => 'two phases',
    })
    expect(shows).toBe(true)
  })

  test('waits while the hosts have work in flight, even once the outcome shows', async () => {
    let inFlight = 3
    const quietChecks: Array<number> = []
    await waitForOutcome({
      timeout: 5_000,
      applied: () => true,
      quiet: () => {
        quietChecks.push(inFlight)
        if (inFlight > 0) {
          inFlight--
          return false
        }
        return true
      },
      describe: () => 'in flight',
    })
    expect(inFlight).toBe(0)
    // Quiet twice in a row ends it
    expect(quietChecks.slice(-2)).toEqual([0, 0])
  })

  test('an outcome that flips back before the second check is not settled', async () => {
    const seen: Array<boolean> = []
    let calls = 0
    await waitForOutcome({
      timeout: 5_000,
      applied: () => {
        calls++
        // true, then false once (a reload blanks the page), then true
        const value = calls !== 2
        seen.push(value)
        return value
      },
      describe: () => 'flip',
    })
    expect(seen).toContain(false)
  })

  test('fails at its one bound with what it saw', async () => {
    await expect(
      waitForOutcome({
        timeout: 200,
        applied: () => false,
        describe: () => 'the page shows "v1"',
      }),
    ).rejects.toThrow(/within 200 ms\n.*the page shows "v1"/)
  })

  test('failWhenQuietFor: hosts quiet without the outcome end the wait after that long, not at the bound', async () => {
    const started = Date.now()
    await expect(
      waitForOutcome({
        timeout: 10_000,
        failWhenQuietFor: 300,
        applied: () => false,
        quiet: () => true,
        describe: () => 'the page shows "v1"',
      }),
    ).rejects.toThrow(
      /final state without its outcome.*300 ms\n.*the page shows "v1"/s,
    )
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(300)
    expect(elapsed).toBeLessThan(5_000)
  })

  test('failWhenQuietFor: work in flight restarts the quiet time; an outcome that shows then completes', async () => {
    const started = Date.now()
    let checks = 0
    await waitForOutcome({
      timeout: 10_000,
      failWhenQuietFor: 300,
      // Quiet, but busy again every 200 ms (each step of a slow edit), until
      // the outcome shows after 1 s
      quiet: () => {
        checks++
        return (Date.now() - started) % 200 > 60
      },
      applied: () => Date.now() - started > 1_000,
      describe: () => 'steps',
    })
    expect(Date.now() - started).toBeGreaterThan(1_000)
    expect(checks).toBeGreaterThan(5)
  })

  test('a problem ends the wait at once', async () => {
    const started = Date.now()
    await expect(
      waitForOutcome({
        timeout: 5_000,
        applied: async () => {
          await sleep(5)
          return false
        },
        problems: () => ['Uncaught ReferenceError: x is not defined'],
        describe: () => 'problem',
      }),
    ).rejects.toThrow(/the edit failed: Uncaught ReferenceError/)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  // One bound for the whole observation: a probe that answers late, or
  // never, does not stretch it, and expiry wins over a late success.
  test('an outcome that shows only after the bound is a timeout, not a success', async () => {
    const started = Date.now()
    let calls = 0
    await expect(
      waitForOutcome({
        timeout: 60,
        applied: async () => {
          calls++
          if (calls < 3) {
            return false
          }
          await sleep(150)
          return true
        },
        describe: () => 'late',
      }),
    ).rejects.toThrow(/within 60 ms\nlate/)
    expect(Date.now() - started).toBeLessThan(150)
  })

  test('a check that answers after the bound, synchronously, is a timeout, not a success', async () => {
    const started = Date.now()
    let calls = 0
    await expect(
      waitForOutcome({
        timeout: 100,
        applied: () => {
          calls++
          // The second round's last check keeps the event loop past the
          // bound; its answer would settle the wait
          if (calls === 4) {
            while (Date.now() - started < 150) {
              // busy
            }
          }
          return true
        },
        describe: () => 'blocked',
      }),
    ).rejects.toThrow(/within 100 ms\nblocked/)
  })

  test('a probe that never settles fails at the bound, and so does a description that never settles', async () => {
    const started = Date.now()
    await expect(
      waitForOutcome({
        timeout: 100,
        applied: () => true,
        quiet: () => new Promise<boolean>(() => {}),
        describe: () => new Promise<string>(() => {}),
      }),
    ).rejects.toThrow(/within 100 ms/)
    expect(Date.now() - started).toBeLessThan(2_500)
  })

  // An edit that ended without its outcome is a failed expectation (a known-
  // bug pin passes on it); a wait that could not tell is not.
  test('an edit without its outcome fails as an assertion with what was expected and seen; the bound as a SettleTimeout', async () => {
    const failure = (wait: Parameters<typeof waitForOutcome>[0]) =>
      waitForOutcome(wait).then(
        () => undefined,
        (error: unknown) => error as Record<string, unknown>,
      )
    expect(
      await failure({
        timeout: 5_000,
        applied: () => false,
        problems: () => ['Uncaught ReferenceError: x is not defined'],
        describe: () => 'problem',
      }),
    ).toMatchObject({
      name: 'AssertionError',
      actual: ['Uncaught ReferenceError: x is not defined'],
      expected: [],
    })
    expect(
      await failure({
        timeout: 10_000,
        failWhenQuietFor: 100,
        applied: () => false,
        quiet: () => true,
        describe: () => 'the page shows "v1"',
        observed: () => ({ actual: 'v1', expected: 'v2' }),
      }),
    ).toMatchObject({ name: 'AssertionError', actual: 'v1', expected: 'v2' })
    expect(
      await failure({
        timeout: 100,
        applied: () => false,
        describe: () => 'the page shows "v1"',
      }),
    ).toBeInstanceOf(SettleTimeout)
  })
})

test('settleTimeoutIn finds a SettleTimeout a wrapper carries, also through a cycle of causes', () => {
  const timeout = new SettleTimeout('a wait ran out of time')
  const cyclic = new Error('wrapper', { cause: new Error('inner') })
  ;(cyclic.cause as Error).cause = cyclic
  expect(settleTimeoutIn(cyclic)).toBeUndefined()
  ;(cyclic.cause as Error & { errors?: unknown }).errors = [timeout]
  expect(settleTimeoutIn({ error: cyclic })).toBe(timeout)
})
