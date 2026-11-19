import { mockServerFn } from '@tanstack/react-start/testing'
import {
  mockMiddleware,
  runInRequest,
} from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { greet, secretMiddleware, welcome } from '../src/greeting'

test('a server function runs its middleware, its validator and its handler', async () => {
  await expect(runInRequest(() => greet({ data: 'Ada' }))).resolves.toBe(
    'Hello Ada, the server secret',
  )
})

test('a call that is made in the file of the server function runs it as well', async () => {
  await expect(runInRequest(() => welcome('Ada'))).resolves.toBe(
    'Hello Ada, the server secret',
  )
})

test('the validator of a server function rejects bad input', async () => {
  await expect(runInRequest(() => greet({ data: '' }))).rejects.toThrow(
    'A name is required',
  )
})

// On the server a server function runs for real. There is no request that a
// mock could answer.
test('mockServerFn refuses a server function in a server test', () => {
  expect(() =>
    mockServerFn(greet, ({ data }) => `Hello ${data}, from the mock`),
  ).toThrow(
    'mockServerFn() needs a server function that the Start compiler compiled for a client test',
  )
})

// `secretMiddleware` is created in the file of `greet`.
test('mockMiddleware replaces a middleware that is created in the file of its server function', async () => {
  await expect(
    runInRequest(() => {
      mockMiddleware(secretMiddleware, ({ next }) =>
        next({ context: { secret: 'a mocked secret' } }),
      )

      return greet({ data: 'Ada' })
    }),
  ).resolves.toBe('Hello Ada, a mocked secret')
})
