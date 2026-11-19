import { afterEach, describe, expect, test } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { redirect } from '@tanstack/router-core'
import { createMiddleware } from '../src/createMiddleware'
import { createServerFn } from '../src/createServerFn'
import { resetServerFnMocks, mockServerFn } from '../src/testing'
import { createClientRpc } from '../src/testing/client-rpc'
import type { AnyClientServerFn } from '../src/testing'

/** The id the compiler of a dev server or a test run gives a server function. */
function devId(name: string, file = '/src/greeting.ts') {
  return Buffer.from(
    JSON.stringify({
      file: `${file}?tss-serverfn-split`,
      export: `${name}_createServerFn_handler`,
    }),
  ).toString('base64url')
}

type Greet = AnyClientServerFn &
  ((options: { data: string }) => Promise<string>)

/**
 * A server function as the compiler leaves it in the client code of a test
 * run: `.handler()` gets `createClientRpc(id)` in place of the handler.
 */
function clientServerFn(
  id: string,
  builder: { handler: unknown } = createServerFn({ method: 'POST' }),
) {
  return (builder.handler as (extractedFn: unknown) => Greet)(
    createClientRpc(id),
  )
}

/**
 * This package's own code is not compiled, so Start's isomorphic functions
 * run their server implementation here and need a request context.
 */
function call<T>(fn: () => Promise<T>) {
  return runWithStartContext(
    {
      getRouter() {
        throw new Error('A server function call does not need a router')
      },
      request: new Request('http://localhost/'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    fn,
  )
}

afterEach(() => {
  resetServerFnMocks()
})

describe('a server function call in a client test', () => {
  test('resolves to what its mock returns for the data of the call', async () => {
    const greet = clientServerFn(devId('greet'))
    mockServerFn(greet, ({ data, method }) => `Hello ${data} by ${method}`)

    await expect(call(() => greet({ data: 'Ada' }))).resolves.toBe(
      'Hello Ada by POST',
    )
  })

  test('resolves to what an async mock resolves to', async () => {
    const greet = clientServerFn(devId('greet'))
    mockServerFn(greet, async ({ data }) => `Hello ${data}`)

    await expect(call(() => greet({ data: 'Ada' }))).resolves.toBe('Hello Ada')
  })

  test("runs the function's client middleware, and the mock gets the headers it adds", async () => {
    const order: Array<string> = []
    const greet = clientServerFn(
      devId('greet'),
      createServerFn({ method: 'POST' }).middleware([
        createMiddleware({ type: 'function' }).client(async ({ next }) => {
          order.push('client middleware before')
          const result = await next({ headers: { 'x-from-client': 'yes' } })
          order.push('client middleware after')
          return result
        }),
      ]),
    )
    mockServerFn(greet, ({ headers }) => {
      order.push('mock')
      return `x-from-client: ${headers.get('x-from-client')}`
    })

    await expect(call(() => greet({ data: 'Ada' }))).resolves.toBe(
      'x-from-client: yes',
    )
    expect(order).toEqual([
      'client middleware before',
      'mock',
      'client middleware after',
    ])
  })

  test('rejects with what its mock throws', async () => {
    const greet = clientServerFn(devId('greet'))
    const failure = new Error('No such user')
    mockServerFn(greet, () => {
      throw failure
    })

    await expect(call(() => greet({ data: 'Ada' }))).rejects.toBe(failure)
  })

  test('rejects with the redirect its mock throws', async () => {
    const greet = clientServerFn(devId('greet'))
    const toLogin = redirect({ to: '/login' })
    mockServerFn(greet, () => {
      throw toLogin
    })

    await expect(call(() => greet({ data: 'Ada' }))).rejects.toBe(toLogin)
  })

  test('is answered by the last mock of the function', async () => {
    const greet = clientServerFn(devId('greet'))
    mockServerFn(greet, () => 'first')
    mockServerFn(greet, () => 'second')

    await expect(call(() => greet({ data: 'Ada' }))).resolves.toBe('second')
  })

  test('without a mock rejects with an error that names the function and its file', async () => {
    const greet = clientServerFn(devId('greet', '/src/features/greeting.ts'))

    await expect(call(() => greet({ data: 'Ada' }))).rejects.toThrow(
      'The server function "greet" (/src/features/greeting.ts) was called in a client test, where no server runs. Answer the call with mockServerFn() before it is made.',
    )
  })

  test('without a mock rejects with an error that has the id, when the id names no function', async () => {
    const greet = clientServerFn('3f9a1c')

    await expect(call(() => greet({ data: 'Ada' }))).rejects.toThrow(
      'The server function with the id "3f9a1c" was called in a client test',
    )
  })

  test('has no mock after resetServerFnMocks', async () => {
    const greet = clientServerFn(devId('greet'))
    mockServerFn(greet, () => 'mocked')

    resetServerFnMocks()

    await expect(call(() => greet({ data: 'Ada' }))).rejects.toThrow(
      'was called in a client test',
    )
  })

  test('of one function is not answered by the mock of another', async () => {
    const greet = clientServerFn(devId('greet'))
    const farewell = clientServerFn(devId('farewell'))
    mockServerFn(greet, () => 'Hello')

    await expect(call(() => farewell({ data: 'Ada' }))).rejects.toThrow(
      'The server function "farewell"',
    )
  })
})

describe('mockServerFn', () => {
  // The server's and the app's own versions of a server function have an id
  // too, but no test answers their calls.
  test('refuses a server function that was not compiled for a client test', () => {
    const notForATest = Object.assign(async () => 'sent', {
      url: '/_serverFn/abc',
      serverFnMeta: { id: 'abc' },
    }) as unknown as Greet

    expect(() => mockServerFn(notForATest, () => 'mocked')).toThrow(
      'mockServerFn() needs a server function that the Start compiler compiled for a client test',
    )
  })

  test('refuses a function that is no server function', () => {
    const plain = (async () => 'plain') as unknown as Greet

    expect(() => mockServerFn(plain, () => 'mocked')).toThrow(
      'mockServerFn() needs a server function',
    )
  })
})
