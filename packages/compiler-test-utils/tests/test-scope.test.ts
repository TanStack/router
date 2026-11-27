/**
 * Controls of the test scope (test-scope.ts): the work of a test finds its
 * test, and an async context of the test that outlives it (what a bundler's
 * native callback keeps) no longer holds the test once it finished.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, test } from 'vitest'
import { currentTest, runInTestScope } from '../src/test-scope'

describe('test scope', () => {
  test('the work of a test finds its test, and an async context kept from it holds no test once the test finished', (context) => {
    let keptContext: ReturnType<typeof AsyncLocalStorage.snapshot> | undefined
    // Runs after the scope's own cleanup (last registered first)
    context.onTestFinished(() => {
      expect(keptContext!(() => currentTest())).toBeUndefined()
    })
    return runInTestScope(context, async () => {
      keptContext = AsyncLocalStorage.snapshot()
      await Promise.resolve()
      expect(currentTest()).toBe(context)
      expect(keptContext(() => currentTest())).toBe(context)
    })
  })
})
