import { getRouterInstance } from '@tanstack/react-start'
import { getResponseHeader } from '@tanstack/react-start/server'
import {
  mockMiddleware,
  runInRequest,
  runMiddleware,
} from '@tanstack/react-start/testing/server'
import { expect, test } from 'vitest'
import { authMiddleware } from '../src/middleware/auth'
import { fetchPost, likePost } from '../src/posts'
import { recordedCalls } from '../src/server-only'

test('runInRequest resolves to what a server function returns', async () => {
  const post = await runInRequest(() => fetchPost({ data: '1' }))

  expect(post.title).toBe('The first post')
})

test('a server function runs behind the global middleware of src/start.ts', async () => {
  const callsBefore = recordedCalls().length
  const post = await runInRequest(
    { headers: { 'accept-language': 'de-DE' } },
    () => fetchPost({ data: '1' }),
  )

  expect(post).toEqual({ id: '1', title: 'Der erste Beitrag' })
  // (the global function middleware of the app wrote its audit log)
  expect(recordedCalls().slice(callsBefore)).toContain('fetchPost')
})

test('a server function fails as in the app', async () => {
  await expect(
    runInRequest(() => fetchPost({ data: 'unknown' })),
  ).rejects.toMatchObject({ isNotFound: true })
})

test('a test checks between two calls and reads what a handler set on the response', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    expect(await likePost({ data: '1' })).toBe(1)
    // (a user counts once)
    expect(await likePost({ data: '1' })).toBe(1)

    expect(getResponseHeader('cache-control')).toBe('no-store')
  })
})

test('the middleware of a server function refuses a request without a session', async () => {
  await expect(runInRequest(() => likePost({ data: '1' }))).rejects.toThrow(
    'Not signed in',
  )
})

test('mockMiddleware puts a user of the test in place of the session', async () => {
  mockMiddleware(authMiddleware, ({ next }) =>
    next({ context: { user: { id: 'u2', name: 'Grace' } } }),
  )

  await expect(runInRequest(() => likePost({ data: '2' }))).resolves.toBe(1)
})

test('runMiddleware calls a middleware on its own', async () => {
  await runInRequest({ headers: { cookie: 'session=ada' } }, async () => {
    const { context } = await runMiddleware(authMiddleware, {})

    expect(context.user).toEqual({ id: 'u1', name: 'Ada' })
  })

  await runInRequest(async () => {
    await expect(runMiddleware(authMiddleware, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})

test('globalMiddleware: skip leaves the middleware of src/start.ts out', async () => {
  const callsBefore = recordedCalls().length

  const post = await runInRequest(
    {
      // (the header would make the request middleware choose German)
      headers: { 'accept-language': 'de-DE' },
      globalMiddleware: 'skip',
      context: { locale: 'en' },
    },
    () => fetchPost({ data: '3' }),
  )

  expect(post.title).toBe('The third post')
  expect(recordedCalls()).toHaveLength(callsBefore)
})

test('the context that stands for the global middleware is typed', () => {
  // Checked by `tsc` (`test:e2e:types`), never called.
  const check = () => [
    // @ts-expect-error the request middleware of src/start.ts passes a locale on
    runInRequest({ globalMiddleware: 'skip' }, () => undefined),
    runInRequest(
      // @ts-expect-error the app has no French
      { globalMiddleware: 'skip', context: { locale: 'fr' } },
      () => undefined,
    ),
  ]

  expect(check).toBeTypeOf('function')
})

test('the router of the app is at the URL of the request', async () => {
  await runInRequest({ url: '/posts/1?from=test' }, async () => {
    const router = await getRouterInstance()

    expect(router.history.location.href).toBe('/posts/1?from=test')
    expect(Object.keys(router.routesById)).toContain('/posts/$postId')
  })
})
