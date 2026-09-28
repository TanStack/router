// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { RawStream, notFound } from '@tanstack/router-core'
import {
  TSS_FORMDATA_CONTEXT,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  createCsrfMiddleware,
} from '@tanstack/start-client-core'
import { createStartHandler } from '../src/createStartHandler'
import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_JSON,
  createClientRpc,
} from '@tanstack/start-client-core/client-rpc'
import {
  getRequestUrl,
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
    'drops serialized success body for %s responses',
    async (status) => {
      const action = createAction()
      action.mockImplementation(() => {
        setResponseStatus(status)
        return { result: { ok: true } }
      })
      serverFnMocks.action = action
      const handler = createHandler()

      const response = await handler(createServerFunctionRequest(), {})

      expect(response.status).toBe(status)
      expect(response.body).toBe(null)
      expect(await response.text()).toBe('')
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
    'drops serialized error body for %s responses',
    async (status) => {
      const action = createAction()
      action.mockImplementation(() => {
        setResponseStatus(status)
        throw new Error('no body')
      })
      serverFnMocks.action = action
      const handler = createHandler()

      const response = await handler(createServerFunctionRequest(), {})

      expect(response.status).toBe(status)
      expect(response.body).toBe(null)
      expect(await response.text()).toBe('')
    },
  )
})
