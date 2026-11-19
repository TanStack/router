import { expect, test } from 'vitest'
import { describeRuntime, getLanguage, getSecret } from '../src/runtime'

test('an isomorphic function runs its client implementation', () => {
  expect(describeRuntime()).toBe('client')
})

test('a client-only function runs', () => {
  expect(getLanguage()).toBe(navigator.language)
})

test('a server-only function throws', () => {
  expect(() => getSecret()).toThrow()
})

test('the module that only server code uses is never loaded', () => {
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
