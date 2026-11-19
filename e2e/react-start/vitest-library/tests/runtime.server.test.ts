import { expect, test } from 'vitest'
import { describeRuntime, getLanguage, getSecret } from '../src/runtime'

test('an isomorphic function runs its server implementation', () => {
  expect(describeRuntime()).toBe('server with the server secret')
})

test('a server-only function runs', () => {
  expect(getSecret()).toBe('the server secret')
})

test('a client-only function throws', () => {
  expect(() => getLanguage()).toThrow()
})

test('the module that server code uses is loaded', () => {
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBe(true)
})
