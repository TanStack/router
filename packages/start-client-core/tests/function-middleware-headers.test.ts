import { expect, test } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { createMiddleware } from '../src/createMiddleware'
import { executeMiddleware } from '../src/createServerFn'

function runMiddleware(
  middlewares: Parameters<typeof executeMiddleware>[0],
  env: 'client' | 'server',
  headers?: HeadersInit,
) {
  return runWithStartContext(
    {
      getRouter() {
        throw new Error('Function middleware does not need a router')
      },
      request: new Request('http://localhost/_serverFn/header-test'),
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: 'serverFn',
    },
    () =>
      executeMiddleware(middlewares, env, {
        method: 'POST',
        data: undefined,
        serverFnMeta: { id: 'header-test' },
        context: { request: 'request-context' },
        headers,
      }),
  )
}

test('client next() provides headers when no headers were supplied', async () => {
  let observedHeaders: HeadersInit | undefined
  const middleware = createMiddleware({ type: 'function' }).client(
    async ({ next }) => {
      const result = await next()
      observedHeaders = result.headers
      return result
    },
  )

  const result = await runMiddleware([middleware], 'client')

  expect(observedHeaders).toBeDefined()
  expect(Array.from(new Headers(observedHeaders))).toEqual([])
  expect(result.headers).toBe(observedHeaders)
})

test.each([
  ['client', 'omitted'],
  ['server', 'omitted'],
  ['client', 'empty'],
  ['server', 'empty'],
] as const)(
  '%s next() preserves context with %s sendContext',
  async (env, sendContext) => {
    const options =
      sendContext === 'omitted'
        ? { context: { hop: 'kept' } }
        : { context: { hop: 'kept' }, sendContext: {} }
    const assertResult = (result: {
      context?: unknown
      sendContext?: unknown
    }) => {
      expect(result.context).toEqual({
        request: 'request-context',
        hop: 'kept',
      })
      if (sendContext === 'omitted') {
        expect(result.sendContext).toBeUndefined()
      } else {
        expect(result.sendContext).toBeDefined()
        expect(result.sendContext).toEqual({})
      }
    }
    const middleware = createMiddleware({ type: 'function' })
      .client(async ({ next }) => {
        const result = await next(options)
        assertResult(result)
        return result
      })
      .server(async ({ next }) => {
        const result = await next(options)
        assertResult(result)
        return result
      })

    const result = await runMiddleware([middleware], env)

    expect(result.error).toBeUndefined()
    assertResult(result)
  },
)

test('server middleware preserves context and sendContext without headers', async () => {
  const first = createMiddleware({ type: 'function' }).server(({ next }) =>
    next({ context: { first: 'one' }, sendContext: { firstReply: 'one' } }),
  )
  const second = createMiddleware({ type: 'function' })
    .middleware([first])
    .server(({ context, next }) => {
      expect(context.first).toBe('one')
      return next({
        context: { second: 'two' },
        sendContext: { secondReply: 'two' },
      })
    })

  const result = await runMiddleware([second], 'server')

  expect(result.context).toEqual({
    request: 'request-context',
    first: 'one',
    second: 'two',
  })
  expect(result.sendContext).toEqual({ firstReply: 'one', secondReply: 'two' })
})

test.each(['client', 'server'] as const)(
  '%s middleware preserves explicitly supplied headers',
  async (env) => {
    const headers = new Headers({ 'x-call': 'preserved' })
    const middleware = createMiddleware({ type: 'function' })
      .client(({ next }) => next())
      .server(({ next }) => next())

    const result = await runMiddleware([middleware], env, headers)

    expect(new Headers(result.headers).get('x-call')).toBe('preserved')
    expect(headers.get('x-call')).toBe('preserved')
  },
)

test('client middleware merges supplied headers without changing either input', async () => {
  const headers = new Headers({ 'x-initial': 'one', 'x-shared': 'initial' })
  headers.append('set-cookie', 'first=one; Path=/')
  const nextHeaders = new Headers({ 'x-next': 'two', 'x-shared': 'next' })
  nextHeaders.append('set-cookie', 'second=two; Path=/')
  const originalHeaders = Array.from(headers)
  const originalNextHeaders = Array.from(nextHeaders)
  const middleware = createMiddleware({ type: 'function' }).client(({ next }) =>
    next({ headers: nextHeaders }),
  )

  const result = await runMiddleware([middleware], 'client', headers)
  const merged = new Headers(result.headers)

  expect(merged.get('x-initial')).toBe('one')
  expect(merged.get('x-next')).toBe('two')
  expect(merged.get('x-shared')).toBe('next')
  expect(merged.getSetCookie()).toEqual([
    'first=one; Path=/',
    'second=two; Path=/',
  ])
  expect(Array.from(headers)).toEqual(originalHeaders)
  expect(Array.from(nextHeaders)).toEqual(originalNextHeaders)
})

test('client middleware can supply headers when the call supplied none', async () => {
  const middleware = createMiddleware({ type: 'function' }).client(({ next }) =>
    next({ headers: { 'x-next': 'present' } }),
  )

  const result = await runMiddleware([middleware], 'client')

  expect(new Headers(result.headers).get('x-next')).toBe('present')
})

test.each(['client', 'server'] as const)(
  '%s executor reads initial middleware options in order without repeating accessors',
  async (env) => {
    const reads: Array<string> = []
    const ignoredSendContext = Object.freeze({ selected: 'first read' })
    const selectedSendContext = Object.freeze({ selected: 'second read' })
    const context = Object.freeze({ request: 'preserved' })
    const headers = new Headers({ 'x-initial': 'preserved' })
    const fetch = async () => new Response('unused')
    let sendContextReads = 0

    const result = await runWithStartContext(
      {
        getRouter() {
          throw new Error('Function middleware does not need a router')
        },
        request: new Request('http://localhost/_serverFn/accessor-test'),
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
      },
      () =>
        executeMiddleware([], env, {
          method: 'POST',
          data: undefined,
          serverFnMeta: { id: 'accessor-test' },
          get headers() {
            reads.push('headers')
            return headers
          },
          get sendContext() {
            reads.push('sendContext')
            sendContextReads++
            return sendContextReads === 1
              ? ignoredSendContext
              : selectedSendContext
          },
          get context() {
            reads.push('context')
            return context
          },
          get fetch() {
            reads.push('fetch')
            return fetch
          },
        }),
    )

    expect(reads).toEqual([
      'headers',
      'sendContext',
      'context',
      'fetch',
      'headers',
      'sendContext',
      'context',
      'fetch',
    ])
    expect(result.sendContext).toBe(selectedSendContext)
    expect(result.context).toBe(context)
    expect(result.headers).toBe(headers)
    expect(result.fetch).toBe(fetch)
  },
)
