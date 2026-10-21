/**
 * Controls of the edit completion by outcome (outcome.ts; N21): the wait
 * ends once the outcome holds with the hosts quiet, however many steps the
 * edit took and however late after the first one it shows; it fails at
 * its one bound, or at once on a problem. The old page wait failed a
 * correct two-phase update 500 ms after the first applied update.
 */
import { describe, expect, test } from 'vitest'
import { waitForOutcome } from '../src/outcome'

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
})
