/**
 * Vitest `setupFiles` entry of the compiler test projects: with
 * `COMPILER_TESTS_PINS=run`, every known-bug pin runs as an ordinary test
 * (see `./pins`). Vitest reads a test's `fails` flag when the test ends
 * (typed read-only, as nothing but the test's declaration sets it), so
 * clearing it before the test runs is enough. Without the switch, it
 * registers nothing.
 */
import { beforeEach } from 'vitest'
import { runPins } from './pins'

if (runPins) {
  beforeEach(({ task }) => {
    if (task.fails) {
      ;(task as { fails?: boolean }).fails = false
      task.meta.pin = true
    }
  })
}
