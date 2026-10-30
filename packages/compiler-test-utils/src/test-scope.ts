/**
 * The test a piece of work belongs to, wherever it runs, also when the
 * tests of a file run concurrently (`describe.concurrent`, a project's
 * `sequence.concurrent`): Vitest's global `onTestFinished` and
 * `expect.getState()` name the test that started last, so a helper that
 * owns per-test resources (a leased dev server, a page, a temporary app)
 * asks this module instead.
 *
 * The scope is entered by `./test-scope-setup` (a Vitest `setupFiles`
 * entry: an `aroundEach` hook runs each test inside it). Without it, or
 * outside a test, `currentTest()` is `undefined` and `onTestFinished`
 * falls back to Vitest's global hook (correct for tests that run one at a
 * time).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { onTestFinished as onCurrentTestFinished } from 'vitest'
import type { TestContext } from 'vitest'

const scope = new AsyncLocalStorage<TestContext>()

/** Runs `run` (a test) as the work of `context` (see `./test-scope-setup`). */
export function runInTestScope<T>(context: TestContext, run: () => T): T {
  return scope.run(context, run)
}

/** The context of the test this work belongs to, if any. */
export function currentTest(): TestContext | undefined {
  return scope.getStore()
}

/**
 * Registers `cleanup` to run when the test this work belongs to finishes
 * (pass or fail), as `registerCleanup` of the harnesses takes it.
 */
export function onTestFinished(
  cleanup: () => void | Promise<void>,
  timeout?: number,
): void {
  const context = currentTest()
  if (context) {
    context.onTestFinished(cleanup, timeout)
    return
  }
  onCurrentTestFinished(cleanup, timeout)
}
