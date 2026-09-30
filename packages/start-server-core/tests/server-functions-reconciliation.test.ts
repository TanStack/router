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
  createServerFn,
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
import { createServerRpc } from '../src/createServerRpc'
import { createSsrRpc } from '../src/createSsrRpc'
import { ServerFunctionSerializationAdapter } from '../src/serializer/ServerFunctionSerializationAdapter'
import type { AnyFunctionMiddleware } from '@tanstack/start-client-core'

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

type CallServerFn = (opts?: {
  data?: unknown
  fetch?: (input: string, init: RequestInit) => Promise<Response>
}) => Promise<unknown>
type AttachHandler = (...args: Array<unknown>) => CallServerFn & {
  __executeServer: (opts: unknown) => Promise<unknown>
}

// Calls server function `test` through the client stub a compiled GET call
// site uses, which rethrows failed calls.
function callClientServerFn(
  fetch: (input: string, init: RequestInit) => Promise<Response>,
) {
  return (createServerFn().handler as unknown as AttachHandler)(
    createClientRpc('test'),
  )({ fetch })
}

// Compiled shape of a server function: the provider module registers the
// RPC entry, and callers get a client or server-side stub with the same
// middleware.
function defineServerFn(
  method: 'GET' | 'POST',
  handler: () => unknown,
  middleware: Array<AnyFunctionMiddleware> = [],
) {
  const attach = (extractedFn: unknown, serverFn?: unknown) =>
    (
      createServerFn({ method }).middleware(middleware)
        .handler as unknown as AttachHandler
    )(extractedFn, serverFn)
  const rpc = createServerRpc(
    { id: 'test', name: 'test', filename: 'test.ts' },
    (opts: unknown) => provider.__executeServer(opts),
  )
  const provider = attach(rpc, handler)
  serverFnMocks.action = rpc as unknown as typeof serverFnMocks.action
  const client = attach(createClientRpc('test'))
  const onServer = attach(createSsrRpc('test'))
  let response: Response | undefined

  return {
    call: (data?: unknown) =>
      client({
        data,
        fetch: async (input, init) => {
          response = await createHandler()(
            new Request(new URL(input, 'http://localhost'), init),
            {},
          )
          return response
        },
      }),
    onServer,
    response: () => response!,
  }
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

async function settle(promise: Promise<unknown>) {
  try {
    return { resolved: await promise }
  } catch (rejected) {
    return { rejected }
  }
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
      // A real server function merges the client context with the trusted
      // server context, which wins.
      defineServerFn(method, (({ context }: { context: unknown }) => {
        events.push('action')
        appendResponseHeader('x-steps', 'action')
        return context
      }) as () => unknown)
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

  it('keeps a returned fallback when the action it abandoned completes while an outer middleware awaits', async () => {
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
      const response = await createHandler()(createServerFunctionRequest(), {})

      expect(action).toHaveBeenCalledOnce()
      expect(cancelFallback).not.toHaveBeenCalled()
      expect(response.status).toBe(504)
      expect(response.headers.get('x-tss-serialized')).toBeNull()
      // Helper writes belong to the request, so the abandoned action's
      // writes still apply to the response that replaced its result.
      expect(response.headers.get('x-steps')).toBe('action')
      await expect(response.text()).resolves.toBe('fallback')
    } finally {
      releaseAction()
      await pendingAction
    }
  })

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

    const call = callClientServerFn(async (input, init) => {
      response = await handler(
        new Request(new URL(input, 'http://localhost'), init),
        {},
      )
      return response
    })

    await expect(call).rejects.toThrow('upstream failed')
    expect(action).not.toHaveBeenCalled()
    expect(response!.status).toBe(502)
    expect(response!.headers.get('x-upstream')).toBeNull()
    expect(response!.headers.get('content-type')).toBe('application/json')
    expect(response!.headers.get('content-encoding')).toBeNull()
    expect(response!.headers.get('content-length')).toBeNull()
    expect(response!.headers.getSetCookie()).toEqual([])
  })

  describe('keeps Location off serialized replies', () => {
    async function callWithResponse() {
      let response: Response | undefined
      const call = callClientServerFn(async (input, init) => {
        response = await createHandler()(
          new Request(new URL(input, 'http://localhost'), init),
          {},
        )
        return response
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

      await expect(call).resolves.toEqual({ ok: true })
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

  it('does not let a helper success status hide a request middleware crash', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    serverFnMocks.action = createAction()
    serverFnMocks.middleware = [
      createMiddleware().server(() => {
        setResponseStatus(201, 'Created')
        throw new TypeError('middleware crashed')
      }),
    ]
    let response: Response | undefined

    try {
      await expect(
        callClientServerFn(async (input, init) => {
          response = await createHandler()(
            new Request(new URL(input, 'http://localhost'), init),
            {},
          )
          return response
        }),
      ).rejects.toThrow('middleware crashed')
      expect(response!.status).toBe(500)
      expect(response!.statusText).toBe('')
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
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

  it('applies a bodyless helper status to a raw Response result without a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const action = createAction()
    action.mockImplementation(() => {
      setResponseStatus(204)
      return { result: new Response('raw body') }
    })
    serverFnMocks.action = action

    try {
      const response = await createHandler()(createServerFunctionRequest(), {})

      expect(response.status).toBe(204)
      expect(response.body).toBeNull()
      expect(response.headers.get('x-tss-raw')).toBe('true')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

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
    let receivedContext: unknown
    defineServerFn('POST', (({ context }: { context: unknown }) => {
      receivedContext = context
      return { ok: true }
    }) as () => unknown)
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
    expect(receivedContext).toEqual({})
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
        await expect(callClientServerFn(fetchResponse)).rejects.toThrow(
          'helper status error',
        )

        action.mockImplementation(() => {
          throw Object.assign(new Error('error status error'), { status })
        })
        await expect(callClientServerFn(fetchResponse)).rejects.toThrow(
          'error status error',
        )
      } finally {
        warnSpy.mockRestore()
        consoleError.mockRestore()
      }
    },
  )
})

describe('server function throws reach the caller', () => {
  // Calls the server function from inside its own handler, as a nested
  // server-side call would, and records how the inner call settled.
  async function settleOnServer(throwInner: () => never) {
    let outcome: { resolved?: unknown; rejected?: unknown } | undefined
    let nested = false
    const { call, onServer } = defineServerFn('POST', async () => {
      if (nested) {
        throwInner()
      }
      nested = true
      outcome = await settle(onServer())
      return { ok: true }
    })

    await expect(call()).resolves.toEqual({ ok: true })
    return outcome!
  }

  const falsyValues = [undefined, null, 0, '', false, Number.NaN, BigInt(0)]

  describe.each(['GET', 'POST'] as const)('falsy throws over %s', (method) => {
    it.each(falsyValues)('rejects with a thrown %s', async (value) => {
      const { call } = defineServerFn(method, () => {
        throw value
      })

      const outcome = await settle(call())

      expect(outcome).toHaveProperty('rejected')
      expect(Object.is(outcome.rejected, value)).toBe(true)
    })

    it.each(falsyValues)(
      'rejects with %s thrown by function middleware and lets outer middleware catch it',
      async (value) => {
        let caught: { value: unknown } | undefined
        const { call } = defineServerFn(method, () => ({ ok: true }), [
          createMiddleware({ type: 'function' }).server(async ({ next }) => {
            try {
              return await next()
            } catch (error) {
              caught = { value: error }
              throw error
            }
          }),
          createMiddleware({ type: 'function' }).server(() => {
            throw value
          }),
        ])

        const outcome = await settle(call())

        expect(outcome).toHaveProperty('rejected')
        expect(Object.is(outcome.rejected, value)).toBe(true)
        expect(caught).toBeDefined()
        expect(Object.is(caught!.value, value)).toBe(true)
      },
    )

    it('still resolves with a returned undefined', async () => {
      const { call } = defineServerFn(method, () => undefined)

      await expect(call()).resolves.toBeUndefined()
    })
  })

  it.each(['GET', 'POST'] as const)(
    'ignores error and result keys a client adds to the %s payload',
    async (method) => {
      let received: unknown
      defineServerFn(method, ((opts: { data: unknown }) => {
        received = opts.data
        return { ok: true }
      }) as () => unknown)
      const payload = JSON.stringify(
        toJSON({ data: 'input', error: 'crafted', result: 'crafted' }),
      )

      const response = await createHandler()(
        method === 'GET'
          ? createServerFunctionRequest(
              `http://localhost/_serverFn/test?payload=${encodeURIComponent(payload)}`,
            )
          : createServerFunctionRequest('http://localhost/_serverFn/test', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: payload,
            }),
        {},
      )

      expect(response.status).toBe(200)
      expect(received).toBe('input')
      expect(await response.text()).not.toContain('crafted')
    },
  )

  it('rejects a server function received as data when its call fails', async () => {
    let outcome: { resolved?: unknown; rejected?: unknown } | undefined
    let nested = false
    const receivedFn = ServerFunctionSerializationAdapter.fromSerializable({
      functionId: 'test',
    }) as unknown as (opts: { data: unknown }) => Promise<unknown>
    const { call } = defineServerFn('POST', async () => {
      if (nested) {
        throw 0
      }
      nested = true
      outcome = await settle(receivedFn({ data: 1 }))
      return { ok: true }
    })

    await expect(call()).resolves.toEqual({ ok: true })
    expect(outcome).toEqual({ rejected: 0 })
  })

  it('rejects a server-side call with a thrown 0', async () => {
    const outcome = await settleOnServer(() => {
      throw 0
    })

    expect(outcome).toEqual({ rejected: 0 })
  })
  describe.each(['GET', 'POST'] as const)(
    'thrown Responses over %s',
    (method) => {
      it('rejects with a thrown Response and keeps its status and body', async () => {
        const { call, response } = defineServerFn(method, () => {
          throw new Response('teapot', { status: 418 })
        })

        const outcome = await settle(call())

        expect(outcome.rejected).toBeInstanceOf(Response)
        const thrown = outcome.rejected as Response
        expect(thrown.status).toBe(418)
        await expect(thrown.text()).resolves.toBe('teapot')
        expect(response().status).toBe(418)
      })

      it('rejects with a Response thrown by function middleware', async () => {
        const { call } = defineServerFn(method, () => ({ ok: true }), [
          createMiddleware({ type: 'function' }).server(() => {
            throw Response.json({ denied: true }, { status: 403 })
          }),
        ])

        const outcome = await settle(call())

        expect(outcome.rejected).toBeInstanceOf(Response)
        const thrown = outcome.rejected as Response
        expect(thrown.status).toBe(403)
        await expect(thrown.json()).resolves.toEqual({ denied: true })
      })

      it('still resolves with a returned Response', async () => {
        const { call } = defineServerFn(
          method,
          () => new Response('returned', { status: 202 }),
        )

        const outcome = await settle(call())

        expect(outcome.resolved).toBeInstanceOf(Response)
        const returned = outcome.resolved as Response
        expect(returned.status).toBe(202)
        await expect(returned.text()).resolves.toBe('returned')
      })
    },
  )

  it('rejects a server-side call with a thrown Response', async () => {
    const outcome = await settleOnServer(() => {
      throw new Response('server-side', { status: 409 })
    })

    expect(outcome.rejected).toBeInstanceOf(Response)
    expect((outcome.rejected as Response).status).toBe(409)
  })
  describe('from global request middleware', () => {
    function throwFromRequestMiddleware(value: unknown) {
      serverFnMocks.middleware = [
        createMiddleware().server(() => {
          throw value
        }),
      ]
      return defineServerFn('POST', () => ({ handler: 'ran' }))
    }

    it.each([
      ['a string', 'boom'],
      ['a plain object', { code: 'E_DENIED' }],
      ['an object shaped like a result', { result: 'looks-like-success' }],
      ['an object shaped like an error envelope', { error: 'inner' }],
      ['zero', 0],
      ['undefined', undefined],
    ])('rejects with %s', async (_, value) => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      try {
        const { call, response } = throwFromRequestMiddleware(value)

        const outcome = await settle(call())

        expect(outcome).toHaveProperty('rejected')
        expect(outcome.rejected).toEqual(value)
        expect(response().status).toBe(500)
        expect(response().headers.get('x-tss-serialized')).toBe('true')
      } finally {
        consoleError.mockRestore()
      }
    })

    it('rejects with the serialization error for a value that cannot be sent', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      try {
        const { call, response } = throwFromRequestMiddleware({
          notSerializable: () => 1,
        })

        const outcome = await settle(call())

        expect(outcome.rejected).toBeInstanceOf(Error)
        expect(response().status).toBe(500)
        expect(response().headers.get('x-tss-serialized')).toBe('true')
      } finally {
        consoleError.mockRestore()
      }
    })

    it('re-sends the reply of next() when request middleware throws it', async () => {
      serverFnMocks.middleware = [
        createMiddleware().server(async ({ next }) => {
          const result = await next()
          throw result.response
        }),
      ]
      const { call } = defineServerFn('POST', () => ({ handler: 'ran' }))

      await expect(call()).resolves.toEqual({ handler: 'ran' })
    })

    it('rejects with an Error and keeps its message', async () => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      try {
        const { call } = throwFromRequestMiddleware(new Error('denied'))

        await expect(call()).rejects.toThrow('denied')
      } finally {
        consoleError.mockRestore()
      }
    })

    it.each([
      ['text', () => new Response('nope', { status: 403 })],
      ['JSON', () => Response.json({ nope: true }, { status: 403 })],
    ])('rejects with a thrown %s Response', async (_, createResponse) => {
      const { call, response } = throwFromRequestMiddleware(createResponse())

      const outcome = await settle(call())

      expect(outcome.rejected).toBeInstanceOf(Response)
      expect((outcome.rejected as Response).status).toBe(403)
      expect(response().status).toBe(403)
    })
  })
})

describe('function middleware', () => {
  it('passes data and context between client middleware, server middleware and the handler', async () => {
    let clientContext: unknown
    let serverResult: unknown
    const { call } = defineServerFn(
      'POST',
      (({ data, context }: { data: unknown; context: object }) => ({
        data,
        context: { ...context },
      })) as () => unknown,
      [
        createMiddleware({ type: 'function' })
          .inputValidator((data: number) => data + 1)
          .client(async ({ next }) => {
            const result = await next({
              context: { local: 'client' },
              sendContext: { sent: 'client' },
            })
            clientContext = { ...result.context }
            return result
          })
          .server(async ({ next }) => {
            const result = await next({
              context: { added: 'server' },
              sendContext: { sent: 'server' },
            })
            serverResult = {
              context: { ...result.context },
              sendContext: { ...result.sendContext },
            }
            return result
          }),
      ],
    )

    await expect(call(1)).resolves.toEqual({
      data: 2,
      context: { sent: 'client', added: 'server' },
    })
    expect(serverResult).toEqual({
      context: { sent: 'client', added: 'server' },
      sendContext: { sent: 'server' },
    })
    expect(clientContext).toEqual({ local: 'client', sent: 'server' })
  })

  it.each([
    ['leaves out context without sendContext', [], { result: 'ok' }],
    [
      'sends back sendContext as context',
      [
        createMiddleware({ type: 'function' }).server(({ next }) =>
          next({ sendContext: { sent: 'server' } }),
        ),
      ],
      { result: 'ok', context: { sent: 'server' } },
    ],
  ])('%s in a reply', async (_, middleware, reply) => {
    defineServerFn('POST', () => 'ok', middleware)

    const response = await createHandler()(
      createServerFunctionRequest('http://localhost/_serverFn/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toJSON({ data: 'input' })),
      }),
      {},
    )

    const received = fromCrossJSON<object>(await response.json(), {})
    expect(Object.keys(received)).toEqual(Object.keys(reply))
    expect(received).toEqual(reply)
  })

  it('runs the validator of middleware that has no server function', async () => {
    const { call } = defineServerFn(
      'POST',
      (({ data }: { data: unknown }) => data) as () => unknown,
      [
        createMiddleware({ type: 'function' })
          .inputValidator((data: number) => data * 10)
          .client(({ next }) => next()),
      ],
    )

    await expect(call(2)).resolves.toBe(20)
  })

  it('skips middleware that already ran as request middleware', async () => {
    const runs: Array<string> = []
    const shared = createMiddleware().server(({ next }) => {
      runs.push('shared')
      return next()
    })
    serverFnMocks.middleware = [shared]
    const { call } = defineServerFn('POST', () => 'ok', [
      shared as unknown as AnyFunctionMiddleware,
      createMiddleware({ type: 'function' })
        .middleware([shared])
        .server(({ next }) => {
          runs.push('function')
          return next()
        }),
    ])

    await expect(call()).resolves.toBe('ok')
    expect(runs).toEqual(['shared', 'function'])
  })

  it('resolves with a Response that server middleware returns', async () => {
    const handler = vi.fn(() => 'unused')
    const { call } = defineServerFn('POST', handler, [
      createMiddleware({ type: 'function' }).server(async ({ next }) => next()),
      createMiddleware({ type: 'function' }).server(
        (() => new Response('from middleware', { status: 202 })) as never,
      ),
    ])

    const outcome = await settle(call())

    expect(outcome.resolved).toBeInstanceOf(Response)
    const returned = outcome.resolved as Response
    expect(returned.status).toBe(202)
    await expect(returned.text()).resolves.toBe('from middleware')
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects with a redirect that server middleware returns', async () => {
    let caught: unknown
    const { call } = defineServerFn('POST', () => 'unused', [
      createMiddleware({ type: 'function' }).server(async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          caught = error
          throw error
        }
      }),
      createMiddleware({ type: 'function' }).server((() =>
        redirect({ href: '/login' })) as never),
    ])

    const outcome = await settle(call())

    expect(isRedirect(caught)).toBe(true)
    expect(outcome.rejected).toSatisfy(
      (value: unknown) => isRedirect(value) && value.options.href === '/login',
    )
  })

  it('lets outer middleware recover from a failure in inner middleware', async () => {
    const { call } = defineServerFn('POST', () => 'unused', [
      createMiddleware({ type: 'function' }).server((async ({
        next,
      }: {
        next: () => Promise<unknown>
      }) => {
        try {
          return await next()
        } catch (error) {
          return { result: `recovered from ${(error as Error).message}` }
        }
      }) as never),
      createMiddleware({ type: 'function' }).server(() => {
        throw new Error('inner')
      }),
    ])

    await expect(call()).resolves.toBe('recovered from inner')
  })

  it('does not duplicate Set-Cookie headers of a server-side call in the result of next()', async () => {
    let cookies: Array<string> | undefined
    let nested = false
    const { call, onServer } = defineServerFn(
      'POST',
      async () => {
        if (!nested) {
          nested = true
          await onServer({
            headers: new Headers([['set-cookie', 'a=1']]),
          } as never)
        }
        return 'ok'
      },
      [
        createMiddleware({ type: 'function' }).server(async ({ next }) => {
          const result = await next()
          const headers = (result as { headers?: HeadersInit }).headers
          if (headers) {
            cookies = new Headers(headers).getSetCookie()
          }
          return result
        }),
      ],
    )

    await expect(call()).resolves.toBe('ok')
    expect(cookies).toEqual(['a=1'])
  })

  it('resolves with the handler result even when middleware passed a result to next()', async () => {
    const { call } = defineServerFn('POST', () => undefined, [
      createMiddleware({ type: 'function' }).server(({ next }) =>
        next({ result: 'from middleware' } as never),
      ),
    ])

    await expect(call()).resolves.toBeUndefined()
  })

  it('rejects when server middleware returns undefined', async () => {
    const { call } = defineServerFn('POST', () => 'unused', [
      createMiddleware({ type: 'function' }).server((() => undefined) as never),
    ])

    await expect(call()).rejects.toThrow(
      'User middleware returned undefined. You must call next() or return a result in your middlewares.',
    )
  })
})
