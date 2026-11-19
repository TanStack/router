// The mock registry without async context, as in Vitest's browser mode.
import { expect, test } from 'vitest'
import { MockRegistry, endTest, startTest } from '../src/testing/mockStores'

test('a mock of a test ends with the test, and the mocks of the file stay', () => {
  const registry = new MockRegistry<string, string>()
  registry.set('fn', 'file mock')
  const testA = {}

  startTest(testA)
  registry.set('fn', 'mock of A')
  expect(registry.get('fn')).toBe('mock of A')
  endTest(testA)

  expect(registry.get('fn')).toBe('file mock')
})

test('a mock passed for a test ends with that test, while another test runs too', () => {
  const registry = new MockRegistry<string, string>()
  const testA = {}
  const testB = {}
  startTest(testA)
  startTest(testB)

  registry.set('first', 'mock of A', testA)
  registry.set('second', 'mock of B', testB)
  endTest(testA)

  expect(registry.get('first')).toBeUndefined()
  expect(registry.get('second')).toBe('mock of B')
  endTest(testB)
})

// Without async context a call cannot say which test made it.
test('the mock registered last answers a call when two tests mock the same key', () => {
  const registry = new MockRegistry<string, string>()
  const testA = {}
  const testB = {}
  startTest(testA)
  startTest(testB)

  registry.set('fn', 'mock of A', testA)
  registry.set('fn', 'mock of B', testB)
  expect(registry.get('fn')).toBe('mock of B')

  endTest(testB)
  expect(registry.get('fn')).toBe('mock of A')
  endTest(testA)
})

// The order is per key: a later registration of A for another key does not
// make A's older mock of `fn` the latest one.
test('the latest registration for a key answers, whatever else was registered since', () => {
  const registry = new MockRegistry<string, string>()
  const testA = {}
  const testB = {}
  startTest(testA)
  startTest(testB)

  registry.set('fn', 'mock of A', testA)
  registry.set('fn', 'mock of B', testB)
  registry.set('other', 'other mock of A', testA)
  expect(registry.get('fn')).toBe('mock of B')

  endTest(testB)
  expect(registry.get('fn')).toBe('mock of A')
  endTest(testA)
})

test('clear() for a given test removes the mocks of that test, while another test runs too', () => {
  const registry = new MockRegistry<string, string>()
  const testA = {}
  const testB = {}
  startTest(testA)
  startTest(testB)
  registry.set('first', 'mock of A', testA)
  registry.set('second', 'mock of B', testB)

  // (without async context the test that started last is B)
  registry.clear(testA)

  expect(registry.get('first')).toBeUndefined()
  expect(registry.get('second')).toBe('mock of B')
  endTest(testA)
  endTest(testB)
})

test('clear() in a test removes only the mocks of that test', () => {
  const registry = new MockRegistry<string, string>()
  registry.set('fn', 'file mock')
  const testA = {}
  startTest(testA)
  registry.set('fn', 'mock of A')

  registry.clear()

  expect(registry.get('fn')).toBe('file mock')
  endTest(testA)
})

// A registry is created when its module loads. When a test loads it with a
// dynamic import(), the mocks it then registered stayed for the next test.
test('a registry created during a test ends the mocks of that test too', () => {
  const testA = {}
  startTest(testA)
  const lateRegistry = new MockRegistry<string, string>()
  lateRegistry.set('fn', 'mock of A')

  endTest(testA)

  expect(lateRegistry.get('fn')).toBeUndefined()
})
