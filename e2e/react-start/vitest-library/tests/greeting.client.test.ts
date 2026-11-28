import { mockServerFn } from '@tanstack/react-start/testing'
import { expect, test } from 'vitest'
import { greet, welcome } from '../src/greeting'

test('a mock answers the call with the data of the call', async () => {
  mockServerFn(greet, ({ data }) => `Hello ${data}, from the mock`)

  await expect(greet({ data: 'Ada' })).resolves.toBe('Hello Ada, from the mock')
})

// The test above registered a mock. Start's setup file ended it with that
// test, so no test of this file removes mocks itself.
test('a server function call without a mock fails with an error that names the function', async () => {
  await expect(greet({ data: 'Ada' })).rejects.toThrow(
    'The server function "greet" (/src/greeting.ts) was called in a client test, where no server runs.',
  )
})

test('a mock answers a call that is made in the file of the server function', async () => {
  mockServerFn(greet, ({ data }) => `Hello ${data}, from the mock`)

  await expect(welcome('Ada')).resolves.toBe('Hello Ada, from the mock')
})

test("the function's client middleware runs before the mock", async () => {
  let header: string | null = null
  mockServerFn(greet, ({ data, headers }) => {
    header = headers.get('x-greeting')
    return `Hello ${data}, from the mock`
  })

  await greet({ data: 'Ada' })

  expect(header).toBe('from the client')
})

test('the handler, the validator and the server middleware are not in the client code', () => {
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
