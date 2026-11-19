// The mock registry with async context, as in Node, jsdom and happy-dom.
import { AsyncLocalStorage } from 'node:async_hooks'
import { expect, test } from 'vitest'
import {
  MockRegistry,
  endTest,
  setAsyncOwnerSource,
  startTest,
} from '../src/testing/mockStores'

const tests = new AsyncLocalStorage<object>()
setAsyncOwnerSource(() => tests.getStore())

function runTest(body: () => Promise<void>) {
  const owner = {}
  startTest(owner)
  return tests.run(owner, body).finally(() => endTest(owner))
}

test('concurrent tests that mock the same key each get their own mock', async () => {
  const registry = new MockRegistry<string, string>()
  const seen: Array<string | undefined> = []
  const later = () => new Promise((resolve) => setTimeout(resolve, 5))

  await Promise.all([
    runTest(async () => {
      registry.set('fn', 'mock of A')
      await later()
      seen.push(registry.get('fn'))
    }),
    runTest(async () => {
      registry.set('fn', 'mock of B')
      await later()
      seen.push(registry.get('fn'))
    }),
  ])

  expect(seen.sort()).toEqual(['mock of A', 'mock of B'])
  expect(registry.get('fn')).toBeUndefined()
})

test('a mock registered outside of a test belongs to the file, also while a test runs', async () => {
  const registry = new MockRegistry<string, string>()

  await runTest(async () => {
    // (as in a beforeAll hook, which runs outside of any test's context)
    tests.exit(() => registry.set('fn', 'file mock'))
    expect(registry.get('fn')).toBe('file mock')
  })

  expect(registry.get('fn')).toBe('file mock')
})

// Work a test leaves running keeps the test's async context after the test
// has ended. A mock it registered became a mock of the file.
test('a mock registered for a test that has ended is an error', async () => {
  const registry = new MockRegistry<string, string>()
  let resume!: () => void
  const resumed = new Promise<void>((resolve) => (resume = resolve))
  let late: Promise<void> | undefined

  await runTest(async () => {
    late = resumed.then(() => registry.set('fn', 'late mock'))
  })
  resume()

  await expect(late).rejects.toThrow(
    'A mock was registered for a test that has already ended.',
  )
  expect(registry.get('fn')).toBeUndefined()
})

test('a reset for a test that has ended leaves the mocks of the file', async () => {
  const registry = new MockRegistry<string, string>()
  registry.set('fn', 'file mock')
  let resume!: () => void
  const resumed = new Promise<void>((resolve) => (resume = resolve))
  let late: Promise<void> | undefined

  await runTest(async () => {
    late = resumed.then(() => registry.clear())
  })
  resume()
  await late

  expect(registry.get('fn')).toBe('file mock')
})
