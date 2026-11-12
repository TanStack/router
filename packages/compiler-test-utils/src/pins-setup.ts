/**
 * Vitest `setupFiles` entry of the compiler test projects, for known-bug
 * pins (`./pins`).
 *
 * A pin passes only when one of its assertions failed: Vitest turns any
 * failure of a `fails` test into a pass, a timeout or an error of the
 * harness too, which would then read as the bug. So a pin whose failures
 * hold no assertion error is reported as the failure it is.
 *
 * With `COMPILER_TESTS_PINS=run`, every pin runs as an ordinary test.
 *
 * Vitest reads a test's `fails` flag once the test and its hooks ended
 * (typed read-only, as nothing but the test's declaration sets it), so it
 * can be cleared before the test runs, or when it finished: the check is a
 * finished-test hook registered before the test's own, so it runs after
 * them (they run last first) and sees what their cleanup reported too.
 */
import { beforeEach } from 'vitest'
import { runPins } from './pins'

beforeEach(({ task, onTestFinished }) => {
  if (!task.fails) {
    return
  }
  const test = task as { fails?: boolean }
  if (runPins) {
    test.fails = false
    task.meta.pin = true
    return
  }
  onTestFinished(() => {
    const errors = task.result?.errors ?? []
    if (
      errors.length > 0 &&
      !errors.some((error) => error.name === 'AssertionError')
    ) {
      test.fails = false
    }
  })
})
