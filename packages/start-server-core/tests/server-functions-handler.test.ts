// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RawStream,
  createSerializationAdapter,
  defaultSerovalPlugins,
  makeSerovalPlugin,
} from '@tanstack/router-core'
import {
  FRAME_HEADER_SIZE,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_FRAMED_STREAMS,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
} from '@tanstack/start-client-core'
import { handleServerAction } from '../src/server-functions-handler'

const handlerMocks = vi.hoisted(() => ({
  action: vi.fn(),
  serializationDestroyed: vi.fn(),
  serializationPlugins: [] as Array<unknown>,
}))

vi.mock('../src/getServerFnById', () => ({
  getServerFnById: async () => handlerMocks.action,
}))

vi.mock('../src/request-response', () => ({
  getResponse: () => ({ status: 200, statusText: 'OK' }),
}))

vi.mock('@tanstack/start-client-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/start-client-core')>()
  return {
    ...actual,
    getDefaultSerovalPlugins: () => [
      ...handlerMocks.serializationPlugins,
      ...defaultSerovalPlugins,
    ],
  }
})

vi.mock('seroval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('seroval')>()
  return {
    ...actual,
    toCrossJSONStream(
      ...args: Parameters<typeof actual.toCrossJSONStream>
    ): ReturnType<typeof actual.toCrossJSONStream> {
      const destroy = actual.toCrossJSONStream(...args)
      return (() => {
        handlerMocks.serializationDestroyed()
        destroy()
      }) as ReturnType<typeof actual.toCrossJSONStream>
    },
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

class ThrowDuringSerialization {}

const serializationFailure = new Error('custom serialization failed')
handlerMocks.serializationPlugins.push(
  makeSerovalPlugin(
    createSerializationAdapter({
      key: 'throw-during-serialization-test',
      test: (value): value is ThrowDuringSerialization => {
        return value instanceof ThrowDuringSerialization
      },
      toSerializable: (): unknown => {
        throw serializationFailure
      },
      fromSerializable: () => new ThrowDuringSerialization(),
    }),
  ),
)

async function createServerFnResponse(result: unknown): Promise<Response> {
  handlerMocks.action.mockResolvedValue({ result })
  const response = await handleServerAction({
    request: new Request('http://localhost/_serverFn/test', {
      method: 'POST',
      headers: { 'x-tsr-serverFn': 'true' },
    }),
    context: {},
    serverFnId: 'test',
  })

  expect(response.headers.get('Content-Type')).toBe(
    TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  )
  return response
}

describe('server-functions-handler framed responses', () => {
  beforeEach(() => {
    handlerMocks.action.mockReset()
    handlerMocks.serializationDestroyed.mockClear()
  })

  it('destroys pending Seroval work when the response is cancelled', async () => {
    const pendingResult = createDeferred<unknown>()
    const response = await createServerFnResponse(pendingResult.promise)
    const reason = new Error('consumer disconnected')

    await response.body!.cancel(reason)

    await vi.waitFor(() => {
      expect(handlerMocks.serializationDestroyed).toHaveBeenCalledTimes(1)
    })
  })

  it('destroys pending work and cancels raw streams when initial serialization fails', async () => {
    const cancel = vi.fn()
    const pending = new Promise<unknown>(() => {})
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    handlerMocks.action.mockResolvedValue({
      result: [
        pending,
        new RawStream(new ReadableStream<Uint8Array>({ cancel })),
        new ThrowDuringSerialization(),
      ],
    })
    try {
      const response = await handleServerAction({
        request: new Request('http://localhost/_serverFn/test', {
          method: 'POST',
          headers: { 'x-tsr-serverFn': 'true' },
        }),
        context: {},
        serverFnId: 'test',
      })

      expect(response.headers.get('Content-Type')).toBe('application/json')
      expect(handlerMocks.serializationDestroyed).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledOnce()
      expect(cancel).toHaveBeenCalledWith(serializationFailure)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('cancels every late raw stream when the output is cancelled', async () => {
    const pendingResult = createDeferred<Array<RawStream>>()
    const cancelReasons: Array<Array<unknown>> = [[], [], []]
    let resolveFirstPull!: () => void
    const firstPull = new Promise<void>((resolve) => {
      resolveFirstPull = resolve
    })
    let firstStream!: ReadableStream<Uint8Array>
    firstStream = new ReadableStream<Uint8Array>({
      pull() {
        if (firstStream.locked) {
          resolveFirstPull()
        }
      },
      cancel(reason) {
        cancelReasons[0]!.push(reason)
      },
    })
    const streams = [
      firstStream,
      ...cancelReasons.slice(1).map((reasons) => {
        return new ReadableStream<Uint8Array>({
          cancel(reason) {
            reasons.push(reason)
          },
        })
      }),
    ]
    const reason = new Error('consumer disconnected')

    const response = await createServerFnResponse(pendingResult.promise)
    pendingResult.resolve(
      streams.map((stream) => {
        return new RawStream(stream)
      }),
    )

    await firstPull
    await response.body!.cancel(reason)

    await vi.waitFor(() => {
      expect(cancelReasons).toEqual([[reason], [reason], [reason]])
    })
  })

  it('rejects excess raw streams discovered after the response starts', async () => {
    const pendingResult = createDeferred<Array<RawStream>>()
    const response = await createServerFnResponse(pendingResult.promise)
    let cancellations = 0
    pendingResult.resolve(
      Array.from({ length: MAX_FRAMED_STREAMS + 1 }, () => {
        return new RawStream(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancellations++
            },
          }),
        )
      }),
    )

    await expect(response.text()).rejects.toThrow(
      `Too many raw streams in framed response (max ${MAX_FRAMED_STREAMS})`,
    )
    await vi.waitFor(() => {
      expect(cancellations).toBe(MAX_FRAMED_STREAMS + 1)
    })
  })

  it('bounds queued JSON while the response consumer is stalled', async () => {
    const pendingValues = [
      createDeferred<string>(),
      createDeferred<string>(),
      createDeferred<string>(),
    ]
    const response = await createServerFnResponse(
      pendingValues.map(({ promise }) => promise),
    )
    const largeValue = 'x'.repeat(
      Math.floor(MAX_FRAME_PAYLOAD_SIZE / 2) + 1024,
    )

    for (const pendingValue of pendingValues) {
      pendingValue.resolve(largeValue)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
    }

    await expect(response.text()).rejects.toThrow(
      `Framed JSON queue exceeded ${FRAME_HEADER_SIZE + MAX_FRAME_PAYLOAD_SIZE} bytes`,
    )
    expect(handlerMocks.serializationDestroyed).toHaveBeenCalledOnce()
  })
})
