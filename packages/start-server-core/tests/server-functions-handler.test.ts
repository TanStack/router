import { afterEach, describe, expect, it, vi } from 'vitest'
import { RawStream } from '@tanstack/router-core'
import { TSS_FORMDATA_CONTEXT } from '@tanstack/start-client-core'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { handleServerAction } from '../src/server-functions-handler'
import {
  FRAME_HEADER_SIZE,
  FrameType,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
} from '../src/frame-protocol'
import {
  getResponse,
  requestHandler,
  setResponseHeader,
  setResponseStatus,
} from '../src/internal-request-response'

const serverFnMocks = vi.hoisted(() => ({
  action: undefined as
    | undefined
    | (ReturnType<typeof vi.fn> & { method: string }),
}))

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: () => serverFnMocks.action,
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
  return requestHandler((request) =>
    runWithStartContext(
      {
        getRouter: async () => undefined as any,
        request,
        startOptions: { serializationAdapters: [] },
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: 'serverFn',
      },
      () =>
        handleServerAction({
          request,
          context: {},
          serverFnId: 'test',
        }),
    ),
  )
}

async function readFrames(response: Response) {
  const reader = response.body!.getReader()
  const frames: Array<{
    type: FrameType
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
      type: view.getUint8(0) as FrameType,
      streamId: view.getUint32(1, false),
      payload: value.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + length),
    })
  }

  return frames
}

afterEach(() => {
  serverFnMocks.action = undefined
})

describe('handleServerAction error handling', () => {
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
      const response = getResponse()
      response.status = 500
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
    const chunkFrame = frames.find((frame) => frame.type === FrameType.CHUNK)

    expect(response.headers.get('content-type')).toBe(
      TSS_CONTENT_TYPE_FRAMED_VERSIONED,
    )
    expect(frames.some((frame) => frame.type === FrameType.JSON)).toBe(true)
    expect(chunkFrame).toBeDefined()
    expect(new TextDecoder().decode(chunkFrame?.payload)).toBe('late')
    expect(
      frames.some(
        (frame) =>
          frame.type === FrameType.END &&
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
