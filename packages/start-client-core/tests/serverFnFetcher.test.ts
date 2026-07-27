import { describe, expect, it, vi } from 'vitest'
import { toCrossJSONStream } from 'seroval'
import {
  RawStream,
  createRawStreamRPCPlugin,
  createSerializationAdapter,
  makeSerovalPlugin,
} from '@tanstack/router-core'
import {
  serverFnFetcher,
  trackPostProcessPromise,
} from '../src/client-rpc/serverFnFetcher'
import {
  FRAME_HEADER_SIZE,
  FrameType,
  MAX_FRAME_PAYLOAD_SIZE,
  TSS_CONTENT_TYPE_FRAMED,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  X_TSS_SERIALIZED,
} from '../src/constants'
import type { SerovalNode } from 'seroval'
import type { Plugin as SerovalPlugin } from 'seroval'

const mocks = vi.hoisted(() => ({ plugins: [] as Array<unknown> }))
vi.mock('../src/getDefaultSerovalPlugins', () => ({
  getDefaultSerovalPlugins: () => mocks.plugins,
}))

const textEncoder = new TextEncoder()

function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
  const view = new DataView(frame.buffer)
  view.setUint8(0, type)
  view.setUint32(1, streamId, false)
  view.setUint32(5, payload.length, false)
  frame.set(payload, FRAME_HEADER_SIZE)
  return frame
}

function encodeJSONPayload(json: string): Uint8Array {
  return encodeFrame(FrameType.JSON, 0, textEncoder.encode(json))
}

function encodeJSONFrame(value: SerovalNode): Uint8Array {
  return encodeJSONPayload(JSON.stringify(value))
}

function serializeInitial(value: unknown): SerovalNode {
  let initial!: SerovalNode
  const destroy = toCrossJSONStream(value, {
    refs: new Map(),
    plugins: mocks.plugins as Array<SerovalPlugin<any, any>>,
    onParse(value) {
      initial ??= value
    },
    onDone() {},
    onError(error) {
      throw error
    },
  })
  destroy()
  return initial
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createFramedResponse(value: unknown) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      controller.enqueue(encodeJSONFrame(serializeInitial(value)))
    },
  })
  const response = new Response(body, {
    headers: {
      'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
      [X_TSS_SERIALIZED]: 'true',
    },
  })
  return { controller, response }
}

function createStreamingFramedResponse(value: unknown) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let destroy!: () => void
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      destroy = toCrossJSONStream(value, {
        refs: new Map(),
        plugins: mocks.plugins as Array<SerovalPlugin<any, any>>,
        onParse(value) {
          controller.enqueue(encodeJSONFrame(value))
        },
        onDone() {},
        onError(error) {
          controller.error(error)
        },
      })
    },
    cancel() {
      destroy()
    },
  })
  const response = new Response(body, {
    headers: {
      'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
      [X_TSS_SERIALIZED]: 'true',
    },
  })
  return { controller, destroy, response }
}

function createRawPromiseFramedResponse() {
  let destroy!: () => void
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let resolveLater!: (value: string) => void
      const later = new Promise<string>((resolve) => {
        resolveLater = resolve
      })
      let rawId!: number
      let initial = true
      destroy = toCrossJSONStream(
        {
          raw: new RawStream(new ReadableStream()),
          later,
        },
        {
          refs: new Map(),
          plugins: [
            createRawStreamRPCPlugin((id) => {
              rawId = id
            }),
          ],
          onParse(value) {
            controller.enqueue(encodeJSONFrame(value))
            if (initial) {
              initial = false
              const chunk = new Uint8Array(MAX_FRAME_PAYLOAD_SIZE)
              controller.enqueue(encodeFrame(FrameType.CHUNK, rawId, chunk))
              setTimeout(() => resolveLater('resolved'), 0)
            }
          },
          onDone() {
            controller.enqueue(
              encodeFrame(FrameType.END, rawId, new Uint8Array()),
            )
            controller.close()
          },
          onError(error) {
            controller.error(error)
          },
        },
      )
    },
    cancel() {
      destroy()
    },
  })
  return new Response(body, {
    headers: {
      'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
      [X_TSS_SERIALIZED]: 'true',
    },
  })
}

async function observe<T>(promise: Promise<T>) {
  return Promise.race([
    promise.then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    ),
    new Promise<{ status: 'pending' }>((resolve) => {
      setTimeout(() => resolve({ status: 'pending' }), 50)
    }),
  ])
}

describe('serverFnFetcher framed responses', () => {
  it('cancels a response body rejected for an incompatible protocol version', async () => {
    let cancelReason: unknown
    const body = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelReason = reason
      },
    })
    const response = new Response(body, {
      headers: {
        'content-type': `${TSS_CONTENT_TYPE_FRAMED}; v=999`,
        [X_TSS_SERIALIZED]: 'true',
      },
    })

    await expect(
      serverFnFetcher(
        '/server-fn',
        [{ method: 'GET', context: {} }],
        async () => response,
      ),
    ).rejects.toThrow('Incompatible framed protocol version')
    await vi.waitFor(() => {
      expect(cancelReason).toBeInstanceOf(Error)
      expect(body.locked).toBe(false)
    })
  })

  it('cancels and unlocks the body after malformed initial JSON', async () => {
    let cancelReason: unknown
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeJSONPayload('{'))
      },
      cancel(reason) {
        cancelReason = reason
      },
    })
    const response = new Response(body, {
      headers: {
        'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
        [X_TSS_SERIALIZED]: 'true',
      },
    })

    await expect(
      serverFnFetcher(
        '/server-fn',
        [{ method: 'GET', context: {} }],
        async () => response,
      ),
    ).rejects.toBeInstanceOf(SyntaxError)
    await vi.waitFor(() => {
      expect(cancelReason).toBeInstanceOf(SyntaxError)
      expect(body.locked).toBe(false)
    })
  })

  it('cancels and unlocks the body when initial deserialization throws', async () => {
    class ThrowingValue {}
    class LaterValue {}
    const failure = new Error('deserialization failed')
    let laterDeserializations = 0
    const plugin = makeSerovalPlugin(
      createSerializationAdapter({
        key: 'throwing-deserializer-test',
        test: (value): value is ThrowingValue | LaterValue =>
          value instanceof ThrowingValue || value instanceof LaterValue,
        toSerializable: (value) => value instanceof LaterValue,
        fromSerializable: (later) => {
          if (later) {
            laterDeserializations++
            return new LaterValue()
          }
          throw failure
        },
      }),
    )
    mocks.plugins.push(plugin)
    let cancelReason: unknown
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encodeJSONFrame(serializeInitial(new ThrowingValue())),
        )
        controller.enqueue(encodeJSONFrame(serializeInitial(new LaterValue())))
      },
      cancel(reason) {
        cancelReason = reason
      },
    })
    const response = new Response(body, {
      headers: {
        'content-type': TSS_CONTENT_TYPE_FRAMED_VERSIONED,
        [X_TSS_SERIALIZED]: 'true',
      },
    })

    try {
      await expect(
        serverFnFetcher(
          '/server-fn',
          [{ method: 'GET', context: {} }],
          async () => response,
        ),
      ).rejects.toMatchObject({ cause: failure })
      await vi.waitFor(() => {
        expect(cancelReason).toBeInstanceOf(Error)
        expect(body.locked).toBe(false)
      })
      expect(laterDeserializations).toBe(0)
    } finally {
      mocks.plugins.pop()
    }
  })

  it('forwards a server-side Promise rejection', async () => {
    let rejectLater!: (error: unknown) => void
    const later = new Promise((_, reject) => {
      rejectLater = reject
    })
    const { controller, destroy, response } = createStreamingFramedResponse({
      later,
    })

    try {
      const result = (await serverFnFetcher(
        '/server-fn',
        [{ method: 'GET', context: {} }],
        async () => response,
      )) as { later: Promise<unknown> }
      const error = new Error('server rejected')

      rejectLater(error)

      await expect(result.later).rejects.toMatchObject({
        message: 'server rejected',
      })
    } finally {
      destroy()
      controller.close()
    }
  })

  it('rejects when transport fails during initial post-processing', async () => {
    class PostProcessedValue {}
    const started = createDeferred()
    const postProcess = createDeferred()
    const plugin = makeSerovalPlugin(
      createSerializationAdapter({
        key: 'pending-post-process-test',
        test: (value): value is PostProcessedValue =>
          value instanceof PostProcessedValue,
        toSerializable: () => null,
        fromSerializable: () => {
          trackPostProcessPromise(postProcess.promise)
          started.resolve()
          return 'decoded'
        },
      }),
    )
    mocks.plugins.push(plugin)
    const { controller, response } = createFramedResponse(
      new PostProcessedValue(),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = serverFnFetcher(
        '/server-fn',
        [{ method: 'GET', context: {} }],
        async () => response,
      )
      await started.promise
      const transportError = new Error('transport failed')

      controller.error(transportError)

      await expect(observe(result)).resolves.toEqual({
        status: 'rejected',
        error: transportError,
      })
    } finally {
      postProcess.resolve()
      mocks.plugins.pop()
      consoleError.mockRestore()
    }
  })

  it('resolves a sibling Promise without consuming an eager RawStream', async () => {
    const result = (await serverFnFetcher(
      '/server-fn',
      [{ method: 'GET', context: {} }],
      async () => createRawPromiseFramedResponse(),
    )) as { raw: ReadableStream<Uint8Array>; later: Promise<string> }

    try {
      await expect(result.later).resolves.toBe('resolved')
    } finally {
      await result.raw.cancel()
    }
  })
})
