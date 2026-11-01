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

/**
 * The scope's value holds the test only until it finished: native code keeps
 * the async contexts it was called from (a Vite build's Rolldown callbacks
 * keep theirs for good), and with them what a test holds, in a process that
 * runs many more files.
 */
const scope = new AsyncLocalStorage<{ test: TestContext | undefined }>()

/** Runs `run` (a test) as the work of `context` (see `./test-scope-setup`). */
export function runInTestScope<T>(context: TestContext, run: () => T): T {
  const scoped = { test: context as TestContext | undefined }
  // (cleanups run last registered first: this one after all of the test's)
  context.onTestFinished(() => {
    scoped.test = undefined
  })
  return scope.run(scoped, run)
}

/** The context of the test this work belongs to, if any. */
export function currentTest(): TestContext | undefined {
  return scope.getStore()?.test
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
