// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { fromCrossJSON, toJSON } from 'seroval'
import {
  RawStream,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from '@tanstack/router-core'
import {
  TSS_FORMDATA_CONTEXT,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  createCsrfMiddleware,
  createMiddleware,
} from '@tanstack/start-client-core'
import {
  createStartHandler,
  transferResponseBodyOwnership,
} from '../src/createStartHandler'
import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_JSON,
  createClientRpc,
} from '@tanstack/start-client-core/client-rpc'
import {
  appendResponseHeader,
  getRequestUrl,
  getResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from '../src/request-response'

const serverFnMocks = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return {
    previousServerFnBase,
    middleware: [] as Array<unknown>,
    action: undefined as
      | undefined
      | (ReturnType<typeof vi.fn> & { method: string }),
  }
})

vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({
      requestMiddleware: serverFnMocks.middleware,
      serializationAdapters: [],
    }),
  },
}))

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: () => serverFnMocks.action,
}))

// Run the public client RPC in Node without the compiler's browser replacement.
vi.mock('../../start-client-core/dist/esm/getStartOptions.js', () => ({
  getStartOptions: () => undefined,
}))

function createServerFunctionRequest(
  input = 'http://localhost/_serverFn/test',
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers)
  headers.set('x-tsr-serverFn', 'true')
  return new Request(input, { ...init, headers })
}

function createAction(method = 'GET') {
  return Object.assign(vi.fn(), { method })
}

function createHandler() {
  return createStartHandler(() => {
    throw new Error('Server function requests should not render HTML')
  })
}

async function readFrames(response: Response) {
  const reader = response.body!.getReader()
  const frames: Array<{
    type: number
    streamId: number
    payload: Uint8Array
  }> = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    const view = new DataView(value.buffer, value.byteOffset)
    const length = view.getUint32(5, false)
    frames.push({
      type: view.getUint8(0),
      streamId: view.getUint32(1, false),
      payload: value.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + length),
    })
  }

  return frames
}

afterEach(() => {
  serverFnMocks.action = undefined
  serverFnMocks.middleware = []
})

afterAll(() => {
  if (serverFnMocks.previousServerFnBase === undefined) {
    Reflect.deleteProperty(process.env, 'TSS_SERVER_FN_BASE')
  } else {
    process.env.TSS_SERVER_FN_BASE = serverFnMocks.previousServerFnBase
  }
})

describe('server function response reconciliation', () => {
  it.each(['GET', 'POST'] as const)(
    'preserves request middleware context through the %s RPC terminal',
    async (method) => {
      const requestContext = Object.freeze({ nonce: 'request' })
      const globalContext = Object.freeze({
        trusted: 'server',
        global: 'yes',
      })
      const clientContext = Object.freeze({
        trusted: 'client',
        client: 'yes',
      })
      const events: Array<string> = []
      let resumedContext: unknown
      serverFnMocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          events.push('outer before')
          const result = await next({ context: globalContext })
          resumedContext = result.context
          events.push('outer after')
          appendResponseHeader('x-steps', 'outer after')
          return result
        }),
        createMiddleware().server(({ next }) => {
          events.push('inner')
          return next({ context: { inner: 'yes' } })
        }),
      ]
      const action = createAction(method)
      action.mockImplementation(({ context }) => {
        events.push('action')
        appendResponseHeader('x-steps', 'action')
        return { result: context }
      })
      serverFnMocks.action = action
      const payload = JSON.stringify(toJSON({ context: clientContext }))
      const request = createServerFunctionRequest(
        method === 'GET'
          ? `http://localhost/_serverFn/test?payload=${encodeURIComponent(payload)}`
          : 'http://localhost/_serverFn/test',
        method === 'GET'
          ? undefined
          : {
              method,
              headers: { 'content-type': 'application/json' },
              body: payload,
            },
      )

      const response = await createHandler()(request, {
        context: requestContext,
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('x-tss-serialized')).toBe('true')
      expect(response.headers.get('x-steps')).toBe('action, outer after')
      expect(fromCrossJSON(await response.json(), {})).toEqual({
        result: {
          nonce: 'request',
          trusted: 'server',
          global: 'yes',
          client: 'yes',
          inner: 'yes',
        },
      })
      expect(resumedContext).toEqual({
        nonce: 'request',
        trusted: 'server',
        global: 'yes',
        inner: 'yes',
      })
      expect(events).toEqual(['outer before', 'inner', 'action', 'outer after'])
      expect(action).toHaveBeenCalledOnce()
      expect(requestContext).toEqual({ nonce: 'request' })
      expect(globalContext).toEqual({ trusted: 'server', global: 'yes' })
      expect(clientContext).toEqual({ trusted: 'client', client: 'yes' })
    },
  )

  it.each([202, 204, 205, 304])(
    'includes helper writes made while serializing a synchronous result with status %s',
    async (status) => {
      const serialized = vi.fn(() => {
        setResponseStatus(status, 'Serialized status')
        setResponseHeader('x-serialized', 'yes')
        appendResponseHeader('x-steps', 'serialized')
        setCookie('session', 'serialized', { path: '/' })
        setResponseHeader('content-type', 'text/plain')
        setResponseHeader('x-tss-raw', 'true')
        return 'serialized value'
      })
      const action = createAction()
      action.mockReturnValue({
        result: {
          get value() {
            return serialized()
          },
        },
      })
      serverFnMocks.action = action

      const response = await createHandler()(createServerFunctionRequest(), {})

      expect(serialized).toHaveBeenCalledOnce()
      // A serialized reply always carries a body, so a bodyless helper status
      // is ignored together with its status text.
      expect(response.status).toBe(status === 202 ? 202 : 200)
      expect(response.statusText).toBe(
        status === 202 ? 'Serialized status' : '',
      )
      expect(response.headers.get('x-serialized')).toBe('yes')
      expect(response.headers.get('x-steps')).toBe('serialized')
      expect(response.headers.getSetCookie()).toEqual([
        'session=serialized; Path=/',
      ])
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(response.headers.get('x-tss-serialized')).toBe('true')
      expect(response.headers.get('x-tss-raw')).toBeNull()
      expect(fromCrossJSON(await response.json(), {})).toEqual({
        result: { value: 'serialized value' },
      })
    },
  )

  it.each([203, 204])(
    'includes fallback cancellation helper writes when a pending action replaces it with status %s',
    async (status) => {
      let releaseAction!: () => void
      const actionCanFinish = new Promise<void>((resolve) => {
        releaseAction = resolve
      })
      let pendingAction: Promise<unknown> | undefined
      const cancelFallback = vi.fn(() => {
        setResponseStatus(status, 'Cleanup status')
        setResponseHeader('x-cleanup', 'yes')
        appendResponseHeader('x-steps', 'cleanup')
        setCookie('session', 'cleanup', { path: '/' })
      })
      const fallback = new Response(
        new ReadableStream<Uint8Array>({ cancel: cancelFallback }),
        { status: 504 },
      )
      serverFnMocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          releaseAction()
          await pendingAction
          return result
        }),
        createMiddleware().server(({ next }) => {
          pendingAction = Promise.resolve(next())
          return fallback
        }),
      ]
      const action = createAction()
      action.mockImplementation(async () => {
        await actionCanFinish
        appendResponseHeader('x-steps', 'action')
        return { result: 'completed' }
      })
      serverFnMocks.action = action

      try {
        const response = await createHandler()(
          createServerFunctionRequest(),
          {},
        )

        expect(cancelFallback).toHaveBeenCalledOnce()
        expect(response.status).toBe(status === 204 ? 200 : status)
        expect(response.statusText).toBe(status === 204 ? '' : 'Cleanup status')
        expect(response.headers.get('x-cleanup')).toBe('yes')
        expect(response.headers.get('x-steps')).toBe('action, cleanup')
        expect(response.headers.getSetCookie()).toEqual([
          'session=cleanup; Path=/',
        ])
        expect(response.headers.get('content-type')).toBe('application/json')
        expect(response.headers.get('x-tss-serialized')).toBe('true')
        expect(fromCrossJSON(await response.json(), {})).toEqual({
          result: 'completed',
        })
      } finally {
        releaseAction()
        await pendingAction
      }
    },
  )

  it('keeps an early middleware response readable after a late JSON action completes', async () => {
    let releaseAction!: () => void
    const actionCanFinish = new Promise<void>((resolve) => {
      releaseAction = resolve
    })
    let pendingAction: Promise<unknown> | undefined
    const cancelFallback = vi.fn()
    const fallback = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('fallback'))
          controller.close()
        },
        cancel: cancelFallback,
      }),
      { status: 504, headers: { 'x-fallback': 'yes' } },
    )
    serverFnMocks.middleware = [
      createMiddleware().server(({ next }) => {
        pendingAction = Promise.resolve(next())
        return fallback
      }),
    ]
    const action = createAction()
    action.mockImplementation(async () => {
      await actionCanFinish
      return { result: 'late' }
    })
    serverFnMocks.action = action

    try {
      const response = await createHandler()(createServerFunctionRequest(), {})
      expect(response.status).toBe(504)

      releaseAction()
      await pendingAction

      expect(action).toHaveBeenCalledOnce()
      expect(cancelFallback).not.toHaveBeenCalled()
      expect(response.headers.get('x-fallback')).toBe('yes')
      expect(response.headers.get('x-tss-serialized')).toBeNull()
      await expect(response.text()).resolves.toBe('fallback')
    } finally {
      releaseAction()
      await pendingAction
    }
  })

  it('does not publish late JSON after a pending request is aborted', async () => {
    const controller = new AbortController()
    const reason = new Error('Request disconnected')
    let releaseAction!: () => void
    const actionCanFinish = new Promise<void>((resolve) => {
      releaseAction = resolve
    })
    let actionStarted!: () => void
    const started = new Promise<void>((resolve) => {
      actionStarted = resolve
    })
    let observeResponse!: (value: string | undefined) => void
    const observedResponse = new Promise<string | undefined>((resolve) => {
      observeResponse = resolve
    })
    const serialized = vi.fn(() => {
      // Observe the request after all late promise continuations have settled.
      setImmediate(() => observeResponse(getResponseHeader('x-tss-serialized')))
      return 'late'
    })
    const action = createAction()
    action.mockImplementation(async () => {
      actionStarted()
      await actionCanFinish
      return {
        result: {
          get value() {
            return serialized()
          },
        },
      }
    })
    serverFnMocks.action = action
    const pending = createHandler()(
      createServerFunctionRequest('http://localhost/_serverFn/test', {
        signal: controller.signal,
      }),
      {},
    )
    const rejected = expect(pending).rejects.toBe(reason)
    try {
      await started
      controller.abort(reason)
      await rejected
      releaseAction()
      await expect(observedResponse).resolves.toBeUndefined()
      expect(serialized).toHaveBeenCalledOnce()
    } finally {
      releaseAction()
    }
  })

  it('preserves JSON protocol headers when middleware delegates a transformed body', async () => {
    const action = createAction()
    action.mockReturnValue({ result: 'delegated' })
    serverFnMocks.action = action
    serverFnMocks.middleware = [
      createMiddleware().server(async ({ next }) => {
        const result = await next()
        const response = transferResponseBodyOwnership(
          result.response,
          new Response(
            result.response.body!.pipeThrough(new TransformStream()),
            {
              headers: {
                'content-type': 'text/plain',
                'x-tss-raw': 'true',
                'x-delegated': 'yes',
              },
            },
          ),
        )
        appendResponseHeader('x-steps', 'delegated')
        return response
      }),
    ]

    const response = await createHandler()(createServerFunctionRequest(), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
    expect(response.headers.get('x-tss-raw')).toBeNull()
    expect(response.headers.get('x-delegated')).toBe('yes')
    expect(response.headers.get('x-steps')).toBe('delegated')
    expect(fromCrossJSON(await response.json(), {})).toEqual({
      result: 'delegated',
    })
  })

  it('repairs protocol mutations attached to a directly returned next promise', async () => {
    const action = createAction()
    action.mockReturnValue({ result: 'completed' })
    serverFnMocks.action = action
    serverFnMocks.middleware = [
      createMiddleware().server(({ next }) => {
        const pending = next()
        void Promise.resolve(pending).then((result) => {
          result.response.headers.set('content-type', 'text/plain')
          result.response.headers.delete('x-tss-serialized')
          result.response.headers.set('x-tss-raw', 'true')
          appendResponseHeader('x-steps', 'after-next')
        })
        return pending
      }),
    ]

    const response = await createHandler()(createServerFunctionRequest(), {})

    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
    expect(response.headers.get('x-tss-raw')).toBeNull()
    expect(response.headers.get('x-steps')).toBe('after-next')
    expect(fromCrossJSON(await response.json(), {})).toEqual({
      result: 'completed',
    })
  })

  it('round-trips GET input without normalizing the original query encoding', async () => {
    const data = {
      spaces: 'one two three',
      plus: 'one+two',
      tilde: 'one~two',
      unicode: 'Grüße 🌍',
      percent: '100%',
    }
    const action = createAction()
    action.mockImplementation((payload) => ({
      result: { data: payload.data, requestUrl: getRequestUrl().href },
    }))
    serverFnMocks.action = action
    const handler = createHandler()
    let originalUrl = ''

    const result = await createClientRpc('test')({
      method: 'GET',
      data,
      fetch: async (input: string, init: RequestInit) => {
        const url = new URL(input, 'http://localhost')
        const payload = url.searchParams.get('payload')!
        // Mix equivalent space encodings and retain literal ~. URLSearchParams
        // serialization would canonicalize these even though decoding must not.
        const encoded = encodeURIComponent(payload).replace('%20', '+')
        const request = new Request(
          `http://localhost/_serverFn/test?payload=${encoded}&space=a%20b+c&plus=%2b&tilde=~&unicode=%e2%98%83&percent=%25`,
          init,
        )
        originalUrl = request.url
        return handler(request, {})
      },
    })

    expect(action).toHaveBeenCalledOnce()
    expect(action.mock.calls[0]?.[0].data).toEqual(data)
    expect(result).toEqual({ result: { data, requestUrl: originalUrl } })
  })

  it('does not execute the action when an async CSRF matcher allows an aborted request', async () => {
    const controller = new AbortController()
    const reason = new Error('Request disconnected')
    let resolveMatcher!: (allowed: boolean) => void
    let matcherStarted!: () => void
    const started = new Promise<void>((resolve) => {
      matcherStarted = resolve
    })
    const matching = new Promise<boolean>((resolve) => {
      resolveMatcher = resolve
    })
    const matcher = vi.fn(() => {
      matcherStarted()
      return matching
    })
    serverFnMocks.middleware = [createCsrfMiddleware({ origin: matcher })]
    const action = createAction()
    action.mockReturnValue({ result: 'must not execute' })
    serverFnMocks.action = action

    const pending = createHandler()(
      createServerFunctionRequest('http://localhost/_serverFn/test', {
        signal: controller.signal,
        headers: { Origin: 'http://localhost' },
      }),
      {},
    )
    const rejected = expect(pending).rejects.toBe(reason)

    try {
      await started
      expect(action).not.toHaveBeenCalled()
      controller.abort(reason)
      await rejected
      resolveMatcher(true)
      // Let the late matcher continuation attempt to enter the next middleware.
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(matcher).toHaveBeenCalledOnce()
      expect(action).not.toHaveBeenCalled()
    } finally {
      resolveMatcher(true)
    }
  })

  it('preserves HTTP-style action error metadata', async () => {
    const action = createAction()
    const error = Object.assign(new Error('conflict'), {
      status: 409,
      statusText: 'Conflict',
      headers: { 'x-error': 'yes' },
    })
    action.mockImplementation(() => {
      throw error
    })
    serverFnMocks.action = action
    const handler = createHandler()

    const response = await handler(createServerFunctionRequest(), {})

    expect(response.status).toBe(409)
    expect(response.statusText).toBe('Conflict')
    expect(response.headers.get('x-error')).toBe('yes')
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
  })

  it('does not copy upstream Response cause framing or cookies onto serialized errors', async () => {
    const action = createAction()
    serverFnMocks.middleware = [
      createMiddleware().server(() => {
        throw new Error('upstream failed', {
          cause: new Response('<p>upstream</p>', {
            status: 502,
            headers: {
              'content-encoding': 'gzip',
              'content-length': '999',
              'content-type': 'text/html',
              'set-cookie': 'upstream=1; Path=/',
              'x-upstream': 'yes',
            },
          }),
        })
      }),
    ]
    serverFnMocks.action = action
    const handler = createHandler()
    let response: Response | undefined

    const call = createClientRpc('test')({
      method: 'GET',
      fetch: async (input: string, init: RequestInit) => {
        response = await handler(
          new Request(new URL(input, 'http://localhost'), init),
          {},
        )
        return response
      },
    })

    await expect(call).rejects.toThrow('upstream failed')
    expect(action).not.toHaveBeenCalled()
    expect(response!.status).toBe(502)
    expect(response!.headers.get('x-upstream')).toBe('yes')
    expect(response!.headers.get('content-type')).toBe('application/json')
    expect(response!.headers.get('content-encoding')).toBeNull()
    expect(response!.headers.get('content-length')).toBeNull()
    expect(response!.headers.getSetCookie()).toEqual([])
  })

  describe('keeps Location off serialized replies', () => {
    async function callWithResponse() {
      let response: Response | undefined
      const call = createClientRpc('test')({
        method: 'GET',
        fetch: async (input: string, init: RequestInit) => {
          response = await createHandler()(
            new Request(new URL(input, 'http://localhost'), init),
            {},
          )
          return response
        },
      })
      return { call, response: () => response! }
    }

    it('for JSON results with a helper redirect status', async () => {
      const action = createAction()
      action.mockImplementation(() => {
        setResponseStatus(302)
        setResponseHeader('location', '/elsewhere')
        return { result: { ok: true } }
      })
      serverFnMocks.action = action

      const { call, response } = await callWithResponse()

      await expect(call).resolves.toEqual({ result: { ok: true } })
      expect(response().status).toBe(302)
      expect(response().headers.get('location')).toBeNull()
    })

    it('for framed results with a helper redirect status', async () => {
      const action = createAction()
      action.mockImplementation(() => {
        setResponseStatus(303)
        setResponseHeader('location', '/elsewhere')
        return { result: { stream: new RawStream(new ReadableStream()) } }
      })
      serverFnMocks.action = action

      const response = await createHandler()(createServerFunctionRequest(), {})

      expect(response.headers.get('content-type')).toBe(
        TSS_CONTENT_TYPE_FRAMED_VERSIONED,
      )
      expect(response.headers.get('location')).toBeNull()
      await response.body!.cancel()
    })

    it('for errors that carry a redirect status and Location', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      serverFnMocks.action = createAction()
      serverFnMocks.middleware = [
        createMiddleware().server(() => {
          throw Object.assign(new Error('moved'), {
            status: 302,
            headers: { location: 'https://evil.example/' },
          })
        }),
      ]

      try {
        const { call, response } = await callWithResponse()

        await expect(call).rejects.toThrow('moved')
        expect(response().headers.get('location')).toBeNull()
      } finally {
        consoleError.mockRestore()
      }
    })

    it('for not-found envelopes', async () => {
      serverFnMocks.action = createAction()
      serverFnMocks.middleware = [
        createMiddleware().server(() => {
          setResponseStatus(302)
          setResponseHeader('location', '/helper')
          throw notFound({ headers: { location: '/not-found' } })
        }),
      ]

      const { call, response } = await callWithResponse()

      await expect(call).rejects.toSatisfy((value: unknown) =>
        isNotFound(value),
      )
      expect(response().headers.get('location')).toBeNull()
    })
  })

  it('applies helper headers to serialized action errors', async () => {
    const action = createAction()
    action.mockImplementation(() => {
      setResponseStatus(500)
      setResponseHeader('x-error-header', 'yes')
      throw new Error('server function failed')
    })
    serverFnMocks.action = action
    const handler = createHandler()

    const response = await handler(createServerFunctionRequest(), {})

    expect(response.status).toBe(500)
    expect(response.headers.get('x-error-header')).toBe('yes')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
  })

  it('protects not-found transport headers from helper overrides', async () => {
    const action = createAction()
    action.mockImplementation(() => {
      setResponseHeader('content-type', 'text/plain')
      setResponseHeader('x-tss-serialized', 'true')
      throw { isNotFound: true, data: 'missing' }
    })
    serverFnMocks.action = action
    const handler = createHandler()

    const response = await handler(createServerFunctionRequest(), {})

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe(null)
    await expect(response.json()).resolves.toEqual({
      isNotFound: true,
      data: 'missing',
    })
  })

  it('preserves caller not-found headers and cookies while normalizing transport headers', async () => {
    const cookies = [
      'session=one; Path=/; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
      'preferences=two; Path=/',
    ]
    const headers = new Headers({
      'content-type': 'text/plain',
      'x-tss-serialized': 'true',
      'x-tss-raw': 'true',
      'x-not-found': 'preserved',
    })
    for (const cookie of cookies) {
      headers.append('set-cookie', cookie)
    }
    const originalHeaders = Array.from(headers)
    const action = createAction()
    action.mockImplementation(() => {
      setResponseHeader('x-helper', 'also preserved')
      throw notFound({ data: 'missing', headers })
    })
    serverFnMocks.action = action

    const response = await createHandler()(createServerFunctionRequest(), {})

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe(null)
    expect(response.headers.get('x-tss-raw')).toBe(null)
    expect(response.headers.get('x-not-found')).toBe('preserved')
    expect(response.headers.get('x-helper')).toBe('also preserved')
    expect(response.headers.getSetCookie()).toEqual(cookies)
    expect(Array.from(headers)).toEqual(originalHeaders)
    await expect(response.json()).resolves.toEqual({
      isNotFound: true,
      data: 'missing',
    })
  })

  it('captures not-found headers before serializing data', async () => {
    const headers = new Headers({ 'x-snapshot': 'original' })
    const action = createAction()
    action.mockImplementation(() => {
      throw notFound({
        headers,
        data: {
          toJSON() {
            headers.set('x-snapshot', 'changed during serialization')
            setResponseHeader('x-helper', 'written during serialization')
            setResponseHeader('content-type', 'text/plain')
            setResponseHeader('x-tss-raw', 'true')
            return 'missing'
          },
        },
      })
    })
    serverFnMocks.action = action

    const response = await createHandler()(createServerFunctionRequest(), {})

    expect(response.status).toBe(404)
    expect(response.headers.get('x-snapshot')).toBe('original')
    expect(response.headers.get('x-helper')).toBe(
      'written during serialization',
    )
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-raw')).toBeNull()
    expect(headers.get('x-snapshot')).toBe('changed during serialization')
    await expect(response.json()).resolves.toEqual({
      isNotFound: true,
      data: 'missing',
    })
  })

  it.each([204, 205, 304])(
    'keeps serialized success bodies when a helper selects %s',
    async (status) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const action = createAction()
      action.mockImplementation(() => {
        setResponseStatus(status)
        return { result: { ok: true } }
      })
      serverFnMocks.action = action
      const handler = createHandler()
      let response: Response | undefined

      try {
        const result = await createClientRpc('test')({
          method: 'GET',
          fetch: async (input: string, init: RequestInit) => {
            response = await handler(
              new Request(new URL(input, 'http://localhost'), init),
              {},
            )
            return response
          },
        })

        expect(result).toEqual({ result: { ok: true } })
        expect(response!.status).toBe(200)
        expect(response!.headers.get('x-tss-serialized')).toBe('true')
        expect(warnSpy).toHaveBeenCalledOnce()
        expect(warnSpy.mock.calls[0]![0]).toContain(
          `setResponseStatus(${status})`,
        )
      } finally {
        warnSpy.mockRestore()
      }
    },
  )

  it.each([204, 205, 304])(
    'keeps serialized redirect and not-found envelopes when a helper selects %s',
    async (status) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchResponse = async (input: string, init: RequestInit) =>
        createHandler()(
          new Request(new URL(input, 'http://localhost'), init),
          {},
        )

      try {
        const action = createAction()
        action.mockImplementation(() => {
          setResponseStatus(status)
          throw redirect({ href: '/login' })
        })
        serverFnMocks.action = action
        await expect(
          createClientRpc('test')({ method: 'GET', fetch: fetchResponse }),
        ).rejects.toSatisfy(
          (value: unknown) =>
            isRedirect(value) && value.options.href === '/login',
        )

        serverFnMocks.middleware = [
          createMiddleware().server(() => {
            setResponseStatus(status)
            throw notFound({ data: 'missing' })
          }),
        ]
        await expect(
          createClientRpc('test')({ method: 'GET', fetch: fetchResponse }),
        ).rejects.toSatisfy((value: unknown) => isNotFound(value))
      } finally {
        warnSpy.mockRestore()
      }
    },
  )

  it('converts oversized GET payload errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const action = createAction()
    serverFnMocks.action = action
    const handler = createHandler()

    try {
      const response = await handler(
        createServerFunctionRequest(
          `http://localhost/_serverFn/test?payload=${'x'.repeat(1_000_001)}`,
        ),
        {},
      )

      expect(response.status).toBe(500)
      expect(response.headers.get('x-tss-serialized')).toBe('true')
      expect(action).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('falls back to default context for malformed FormData context', async () => {
    const action = createAction('POST')
    action.mockImplementation((payload) => {
      return { result: { context: payload.context, method: payload.method } }
    })
    serverFnMocks.action = action
    const handler = createHandler()
    const formData = new FormData()
    formData.set(TSS_FORMDATA_CONTEXT, '{not json')
    formData.set('field', 'value')

    const response = await handler(
      createServerFunctionRequest('http://localhost/_serverFn/test', {
        method: 'POST',
        body: formData,
      }),
      {},
    )

    expect(response.status).toBe(200)
    expect(action).toHaveBeenCalledOnce()
    expect(action.mock.calls[0]?.[0].context).toEqual({})
  })

  it('streams RawStreams discovered after initial serialization', async () => {
    const action = createAction()
    action.mockImplementation(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('late'))
          controller.close()
        },
      })
      return {
        result: {
          stream: Promise.resolve(new RawStream(stream)),
        },
      }
    })
    serverFnMocks.action = action
    const handler = createHandler()

    const response = await handler(createServerFunctionRequest(), {})
    const frames = await readFrames(response)
    const chunkFrame = frames.find((frame) => frame.type === FRAME_TYPE_CHUNK)

    expect(response.headers.get('content-type')).toBe(
      TSS_CONTENT_TYPE_FRAMED_VERSIONED,
    )
    expect(frames.some((frame) => frame.type === FRAME_TYPE_JSON)).toBe(true)
    expect(chunkFrame).toBeDefined()
    expect(new TextDecoder().decode(chunkFrame?.payload)).toBe('late')
    expect(
      frames.some(
        (frame) =>
          frame.type === FRAME_TYPE_END &&
          frame.streamId === chunkFrame?.streamId,
      ),
    ).toBe(true)
  })

  it.each([204, 205, 304])(
    'keeps serialized error bodies when a helper or the error selects %s',
    async (status) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const fetchResponse = async (input: string, init: RequestInit) => {
        const response = await createHandler()(
          new Request(new URL(input, 'http://localhost'), init),
          {},
        )
        expect(response.status).toBe(500)
        return response
      }

      try {
        const action = createAction()
        action.mockImplementation(() => {
          setResponseStatus(status)
          throw new Error('helper status error')
        })
        serverFnMocks.action = action
        await expect(
          createClientRpc('test')({ method: 'GET', fetch: fetchResponse }),
        ).rejects.toThrow('helper status error')

        action.mockImplementation(() => {
          throw Object.assign(new Error('error status error'), { status })
        })
        await expect(
          createClientRpc('test')({ method: 'GET', fetch: fetchResponse }),
        ).rejects.toThrow('error status error')
      } finally {
        warnSpy.mockRestore()
        consoleError.mockRestore()
      }
    },
  )
})
