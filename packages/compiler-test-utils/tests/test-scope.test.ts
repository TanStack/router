/**
 * Controls of the test scope (test-scope.ts): the work of a test finds its
 * test, and an async context of the test that outlives it (what a bundler's
 * native callback keeps) no longer holds the test once it finished.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, test } from 'vitest'
import { currentTest, runInTestScope } from '../src/test-scope'

describe('test scope', () => {
  let keptContext: ReturnType<typeof AsyncLocalStorage.snapshot>

  test('the work of a test finds its test', (context) =>
    runInTestScope(context, async () => {
      keptContext = AsyncLocalStorage.snapshot()
      await Promise.resolve()
      expect(currentTest()).toBe(context)
      expect(keptContext(() => currentTest())).toBe(context)
    }))

  test('an async context kept from a finished test holds no test', () => {
    expect(keptContext(() => currentTest())).toBeUndefined()
  })
})
