/**
 * Known-bug pins as ordinary tests. A pin (`test.fails`, `it.fails`, their
 * `.each`/`.for` forms, `{ fails: true }`) asserts the correct outcome of a
 * bug today's compiler has (oracle/KNOWN-BUGS.md), and passes while that
 * outcome fails. With `COMPILER_TESTS_PINS=run` (`runPins`), every pin runs
 * as an ordinary test (`./pins-setup`). One run then shows which pins a
 * compiler passes: the run's report lists them (`reportPins`); the pins it
 * still fails are failures.
 */
import path from 'node:path'
import type { TestModule, Vitest } from 'vitest/node'

declare module 'vitest' {
  interface TaskMeta {
    /** A known-bug pin run as an ordinary test (`./pins-setup`). */
    pin?: boolean
  }
}

/** Whether known-bug pins run as ordinary tests. */
export const runPins = process.env.COMPILER_TESTS_PINS === 'run'

/** Prints which pins passed, when they ran as ordinary tests. */
export function reportPins(
  vitest: Vitest,
  testModules: ReadonlyArray<TestModule>,
) {
  if (!runPins) {
    return
  }
  const passed: Array<string> = []
  let failed = 0
  for (const testModule of testModules) {
    for (const testCase of testModule.children.allTests()) {
      if (!testCase.meta().pin) {
        continue
      }
      if (testCase.result().state === 'passed') {
        const file = path.relative(vitest.config.root, testModule.moduleId)
        passed.push(`  ${file} > ${testCase.fullName}`)
      } else {
        failed++
      }
    }
  }
  vitest.logger.log(
    `\nKnown-bug pins run as ordinary tests (COMPILER_TESTS_PINS=run): ${passed.length} passed, ${failed} failed${passed.length > 0 ? `\nPassing pins (remove their \`.fails\`):\n${passed.join('\n')}` : ''}`,
  )
}
