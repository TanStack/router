/**
 * Controls of the run's setup (run-directory.ts): every compiling suite
 * shares it, and it turns the compiler's self-checks on for the run (outputs
 * verified, a violated compiler invariant throws instead of warning).
 */
import { expect, test } from 'vitest'

test('the run turns the compiler self-checks on', () => {
  expect(process.env.TSR_COMPILER_VERIFY).toBe('1')
})
