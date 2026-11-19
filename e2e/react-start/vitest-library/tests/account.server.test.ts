import { getRouterInstance } from '@tanstack/react-start'
import { getResponseHeader } from '@tanstack/react-start/server'
import {
  mockMiddleware,
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'
import { beforeEach, expect, test } from 'vitest'
import { getAccount } from '../src/account'
import { sessionMiddleware } from '../src/session'

beforeEach(() => {
  globalThis.__SESSION_CLIENT_MIDDLEWARE_RAN__ = undefined
})

test('a server function cannot be called outside of a request', async () => {
  await expect(getAccount()).rejects.toThrow(
    /No Start context found.*runInRequest\(\)/,
  )
})

test('a server function runs its middleware and its handler for the request of the test', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    await expect(getAccount()).resolves.toEqual({ name: 'ada' })

    expect(getResponseHeader('cache-control')).toBe('private')
  })
  // (as during server rendering, the client function of the middleware ran)
  expect(globalThis.__SESSION_CLIENT_MIDDLEWARE_RAN__).toBe(true)
})

test('runInRequest resolves to what the callback returns', async () => {
  const account = await runInRequest(
    { headers: { cookie: 'session=ada' } },
    () => getAccount(),
  )

  expect(account).toEqual({ name: 'ada' })
})

test('a server function fails as in the app when its middleware refuses the request', async () => {
  await expect(runInRequest(() => getAccount())).rejects.toThrow(
    'Not signed in',
  )
})

test('mockMiddleware replaces a middleware, its client function included', async () => {
  mockMiddleware(sessionMiddleware, ({ next }) =>
    next({ context: { user: 'grace' } }),
  )

  await expect(runInRequest(() => getAccount())).resolves.toEqual({
    name: 'grace',
  })
  expect(globalThis.__SESSION_CLIENT_MIDDLEWARE_RAN__).toBeUndefined()
})

test('a mock ends with the test that registered it', async () => {
  await expect(runInRequest(() => getAccount())).rejects.toThrow(
    'Not signed in',
  )
})

test('a mock registered inside a request ends with that request', async () => {
  await runInRequest(async () => {
    mockMiddleware(sessionMiddleware, ({ next }) =>
      next({ context: { user: 'grace' } }),
    )

    await expect(getAccount()).resolves.toEqual({ name: 'grace' })
  })

  await expect(runInRequest(() => getAccount())).rejects.toThrow(
    'Not signed in',
  )
})

test('runMiddleware calls the server function of one middleware', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    const { context } = await runMiddleware(sessionMiddleware, {})

    expect(context).toEqual({ user: 'ada' })
  })

  await runInRequest(async () => {
    await expect(runMiddleware(sessionMiddleware, {})).rejects.toThrow(
      'Not signed in',
    )
  })
  expect(globalThis.__SESSION_CLIENT_MIDDLEWARE_RAN__).toBeUndefined()
})

test('a project without a router entry has no router in a request', async () => {
  await expect(runInRequest(() => getRouterInstance())).rejects.toThrow(
    'This project has no router entry',
  )
})
