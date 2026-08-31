import { describe, expect, it } from 'vitest'
import {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_FRAMED_STREAMS,
  createMultiplexedStream,
  encodeChunkFrame,
  encodeEndFrame,
  encodeErrorFrame,
  encodeFrame,
} from '../src/frame-protocol'
import type {
  LateStreamRegistration,
  MultiplexedStreamRecord,
} from '../src/frame-protocol'

function createRecord(
  json: string,
  rawStreams: Array<LateStreamRegistration> = [],
): MultiplexedStreamRecord {
  return { json: new TextEncoder().encode(json), rawStreams }
}

function createRecordStream(
  records: Array<MultiplexedStreamRecord>,
): ReadableStream<MultiplexedStreamRecord> {
  return new ReadableStream({
    start(controller) {
      for (const record of records) {
        controller.enqueue(record)
      }
      controller.close()
    },
  })
}

describe('frame-protocol', () => {
  describe('encodeFrame', () => {
    it('should encode frame with header and payload', () => {
      const payload = new Uint8Array([1, 2, 3, 4])
      const frame = encodeFrame(FRAME_TYPE_CHUNK, 42, payload)

      expect(frame.length).toBe(FRAME_HEADER_SIZE + payload.length)

      // Check header
      const view = new DataView(frame.buffer)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_CHUNK)
      expect(view.getUint32(1, false)).toBe(42) // streamId big-endian
      expect(view.getUint32(5, false)).toBe(4) // length big-endian

      // Check payload
      expect(frame.slice(FRAME_HEADER_SIZE)).toEqual(payload)
    })

    it('should handle empty payload', () => {
      const frame = encodeFrame(FRAME_TYPE_END, 1, new Uint8Array(0))

      expect(frame.length).toBe(FRAME_HEADER_SIZE)

      const view = new DataView(frame.buffer)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_END)
      expect(view.getUint32(5, false)).toBe(0) // length is 0
    })
  })

  describe('encodeChunkFrame', () => {
    it('should encode binary chunk with frame type CHUNK', () => {
      const chunk = new Uint8Array([0xff, 0xfe, 0xfd])
      const frame = encodeChunkFrame(123, chunk)

      const view = new DataView(frame.buffer)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_CHUNK)
      expect(view.getUint32(1, false)).toBe(123)
      expect(view.getUint32(5, false)).toBe(3)

      expect(frame.slice(FRAME_HEADER_SIZE)).toEqual(chunk)
    })
  })

  describe('encodeEndFrame', () => {
    it('should encode end frame with empty payload', () => {
      const frame = encodeEndFrame(456)

      expect(frame.length).toBe(FRAME_HEADER_SIZE)

      const view = new DataView(frame.buffer)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_END)
      expect(view.getUint32(1, false)).toBe(456)
      expect(view.getUint32(5, false)).toBe(0)
    })
  })

  describe('encodeErrorFrame', () => {
    it('should encode Error message', () => {
      const frame = encodeErrorFrame(789, new Error('Something went wrong'))

      const view = new DataView(frame.buffer)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_ERROR)
      expect(view.getUint32(1, false)).toBe(789)

      const payload = frame.slice(FRAME_HEADER_SIZE)
      expect(new TextDecoder().decode(payload)).toBe('Something went wrong')
    })

    it('should handle non-Error values', () => {
      const frame = encodeErrorFrame(1, 'string error')

      const payload = frame.slice(FRAME_HEADER_SIZE)
      expect(new TextDecoder().decode(payload)).toBe('string error')
    })

    it('should handle undefined error', () => {
      const frame = encodeErrorFrame(1, undefined)

      const payload = frame.slice(FRAME_HEADER_SIZE)
      expect(new TextDecoder().decode(payload)).toBe('Unknown error')
    })

    it('should bound oversized raw-stream error messages', () => {
      const frame = encodeErrorFrame(
        1,
        new Error('x'.repeat(MAX_FRAME_PAYLOAD_SIZE + 1)),
      )
      const payload = frame.slice(FRAME_HEADER_SIZE)

      expect(payload.byteLength).toBeLessThan(MAX_FRAME_PAYLOAD_SIZE)
      expect(new TextDecoder().decode(payload)).toMatch(/…$/)
    })
  })

  describe('createMultiplexedStream', () => {
    it('should multiplex JSON stream only', async () => {
      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{"data":1}'),
          createRecord('{"data":2}'),
        ]),
      )

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(chunks.length).toBe(2)

      // Both should be JSON frames
      for (const chunk of chunks) {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        expect(view.getUint8(0)).toBe(FRAME_TYPE_JSON)
      }
    })

    it('should multiplex JSON and raw streams', async () => {
      const rawStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{"result":"ok"}', [{ id: 5, stream: rawStream }]),
        ]),
      )

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have: JSON frame, CHUNK frame, END frame
      expect(chunks.length).toBe(3)

      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types).toEqual([FRAME_TYPE_JSON, FRAME_TYPE_CHUNK, FRAME_TYPE_END])
    })

    it('splits raw chunks at the wire payload limit', async () => {
      const payload = new Uint8Array(MAX_FRAME_PAYLOAD_SIZE + 1)
      const rawStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload)
          controller.close()
        },
      })
      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{"ref":1}', [{ id: 1, stream: rawStream }]),
        ]),
      )
      const reader = multiplexed.getReader()
      const frames: Array<Uint8Array> = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        frames.push(value)
      }

      expect(frames.map((frame) => frame[0])).toEqual([
        FRAME_TYPE_JSON,
        FRAME_TYPE_CHUNK,
        FRAME_TYPE_CHUNK,
        FRAME_TYPE_END,
      ])
      expect(frames[1]!.byteLength - FRAME_HEADER_SIZE).toBe(
        MAX_FRAME_PAYLOAD_SIZE,
      )
      expect(frames[2]!.byteLength - FRAME_HEADER_SIZE).toBe(1)
    })

    it('rejects excess raw streams before starting their readers', async () => {
      let pullCount = 0
      let cancelCount = 0
      const rawStreams = Array.from(
        { length: MAX_FRAMED_STREAMS + 1 },
        (_, index) => ({
          id: index + 1,
          stream: new ReadableStream<Uint8Array>(
            {
              pull() {
                pullCount++
              },
              cancel() {
                cancelCount++
              },
            },
            { highWaterMark: 0 },
          ),
        }),
      )
      const multiplexed = createMultiplexedStream(
        createRecordStream([createRecord('{}', rawStreams)]),
      )

      await expect(multiplexed.getReader().read()).rejects.toThrow(
        'Too many raw streams',
      )
      expect(pullCount).toBe(0)
      expect(cancelCount).toBe(MAX_FRAMED_STREAMS + 1)
      expect(rawStreams.every(({ stream }) => !stream.locked)).toBe(true)
    })

    it('bounds upstream reads and copies chunks only when output has demand', async () => {
      const first = new Uint8Array([1])
      const second = new Uint8Array([2])
      const chunks = [first, second]
      let pullCount = 0
      let chunkIndex = 0
      const rawStream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pullCount++
            const chunk = chunks[chunkIndex++]
            if (chunk) {
              controller.enqueue(chunk)
            } else {
              controller.close()
            }
          },
        },
        { highWaterMark: 0 },
      )
      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{"ref":1}', [{ id: 1, stream: rawStream }]),
        ]),
      )

      // Let every currently runnable pump microtask settle without consuming
      // the output. One chunk is queued and one is held unencoded by its pump.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(pullCount).toBe(1)

      // The second frame must copy its payload only after the first frame is
      // consumed and output capacity becomes available.
      second[0] = 9
      const reader = multiplexed.getReader()
      const jsonFrame = (await reader.read()).value!
      expect(new DataView(jsonFrame.buffer).getUint8(0)).toBe(FRAME_TYPE_JSON)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(pullCount).toBe(2)
      const firstFrame = (await reader.read()).value!
      const secondFrame = (await reader.read()).value!
      expect(firstFrame.slice(FRAME_HEADER_SIZE)).toEqual(new Uint8Array([1]))
      expect(secondFrame.slice(FRAME_HEADER_SIZE)).toEqual(new Uint8Array([9]))

      const endFrame = (await reader.read()).value!
      expect(new DataView(endFrame.buffer).getUint8(0)).toBe(FRAME_TYPE_END)
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('should handle cancel without errors', async () => {
      let recordStreamCancelled = false
      let rawCancelled = false

      const rawStream = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => {})
        },
        cancel() {
          rawCancelled = true
          return new Promise<void>(() => {})
        },
      })

      const recordStream = new ReadableStream<MultiplexedStreamRecord>({
        start(controller) {
          controller.enqueue(createRecord('{}', [{ id: 1, stream: rawStream }]))
        },
        cancel() {
          recordStreamCancelled = true
          return new Promise<void>(() => {})
        },
      })

      const multiplexed = createMultiplexedStream(recordStream)
      const reader = multiplexed.getReader()

      await reader.read()

      // Output cancellation must not adopt a user cancellation promise that
      // is allowed to remain pending forever.
      await reader.cancel()

      expect(recordStreamCancelled).toBe(true)
      expect(rawCancelled).toBe(true)
      expect(recordStream.locked).toBe(false)
      expect(rawStream.locked).toBe(false)
    })

    it('cancels raw streams from a record fulfilled as the request aborts', async () => {
      const reason = new Error('request aborted')
      let cancelReason: unknown
      let cancelCount = 0
      const rawStream = new ReadableStream<Uint8Array>({
        cancel(value) {
          cancelCount++
          cancelReason = value
        },
      })
      const abortController = new AbortController()
      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{}', [{ id: 1, stream: rawStream }]),
        ]),
        { signal: abortController.signal },
      )

      // The record read is already fulfilled, but its pump has not resumed.
      abortController.abort(reason)

      await expect(multiplexed.getReader().read()).rejects.toBe(reason)
      expect(cancelCount).toBe(1)
      expect(cancelReason).toBe(reason)
      expect(rawStream.locked).toBe(false)
    })

    it('should interleave multiple raw streams correctly', async () => {
      // Two streams that emit chunks with different timing
      let resolve1: () => void
      let resolve2: () => void
      const gate1 = new Promise<void>((r) => (resolve1 = r))
      const gate2 = new Promise<void>((r) => (resolve2 = r))

      const rawStream1 = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array([0x11]))
          await gate1
          controller.enqueue(new Uint8Array([0x12]))
          controller.close()
        },
      })

      const rawStream2 = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new Uint8Array([0x21]))
          await gate2
          controller.enqueue(new Uint8Array([0x22]))
          controller.close()
        },
      })

      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{"streams":[1,2]}', [
            { id: 1, stream: rawStream1 },
            { id: 2, stream: rawStream2 },
          ]),
        ]),
      )
      const reader = multiplexed.getReader()

      const chunks: Array<Uint8Array> = []

      // Read first batch (JSON + first chunks from both streams)
      for (let i = 0; i < 3; i++) {
        const { value } = await reader.read()
        if (value) chunks.push(value)
      }

      // Release gates to let streams continue
      resolve1!()
      resolve2!()

      // Read remaining chunks
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have: 1 JSON + 2 CHUNKs + 2 CHUNKs + 2 ENDs = 7 frames
      expect(chunks.length).toBe(7)

      // Verify all frame types present
      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types.filter((t) => t === FRAME_TYPE_JSON).length).toBe(1)
      expect(types.filter((t) => t === FRAME_TYPE_CHUNK).length).toBe(4)
      expect(types.filter((t) => t === FRAME_TYPE_END).length).toBe(2)
    })

    it('should handle late stream registration', async () => {
      // The record containing the late reference is emitted after a delay.
      let resolveGate: () => void
      const gate = new Promise<void>((r) => (resolveGate = r))

      const recordStream = new ReadableStream<MultiplexedStreamRecord>({
        async start(controller) {
          await gate
          controller.enqueue(
            createRecord('{"ref":99}', [
              {
                id: 99,
                stream: new ReadableStream<Uint8Array>({
                  start(c) {
                    c.enqueue(new Uint8Array([0xaa, 0xbb]))
                    c.close()
                  },
                }),
              },
            ]),
          )
          controller.close()
        },
      })

      const multiplexed = createMultiplexedStream(recordStream)

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      // Release gate to let late stream arrive
      resolveGate!()

      // Read remaining frames
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have: JSON, CHUNK, END
      expect(chunks.length).toBe(3)

      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types).toEqual([FRAME_TYPE_JSON, FRAME_TYPE_CHUNK, FRAME_TYPE_END])

      // Verify late stream data
      const chunkFrame = chunks[1]!
      const view = new DataView(chunkFrame.buffer, chunkFrame.byteOffset)
      expect(view.getUint32(1, false)).toBe(99) // streamId
      expect(chunkFrame.slice(FRAME_HEADER_SIZE)).toEqual(
        new Uint8Array([0xaa, 0xbb]),
      )
    })

    it('should handle late stream registration even if JSON is delayed', async () => {
      let startJson: () => void
      const jsonGate = new Promise<void>((r) => (startJson = r))

      const recordStream = new ReadableStream<MultiplexedStreamRecord>({
        async start(controller) {
          await jsonGate
          controller.enqueue(
            createRecord('{"ref":1}', [
              {
                id: 1,
                stream: new ReadableStream<Uint8Array>({
                  start(c) {
                    c.enqueue(new Uint8Array([0x01]))
                    c.close()
                  },
                }),
              },
            ]),
          )
          controller.close()
        },
      })

      const multiplexed = createMultiplexedStream(recordStream)

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      // The stream exists before its delayed JSON record, but the mux must not
      // start it until after that record is admitted.
      await Promise.resolve()
      startJson!()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types).toEqual([FRAME_TYPE_JSON, FRAME_TYPE_CHUNK, FRAME_TYPE_END])
    })

    it('should handle multiple late stream registrations', async () => {
      const recordStream = createRecordStream([
        createRecord('{}', [
          {
            id: 10,
            stream: new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(new Uint8Array([10]))
                c.close()
              },
            }),
          },
          {
            id: 20,
            stream: new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(new Uint8Array([20]))
                c.close()
              },
            }),
          },
        ]),
      ])

      const multiplexed = createMultiplexedStream(recordStream)

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have: JSON, CHUNK(10), END(10), CHUNK(20), END(20)
      // Order may vary but all should be present
      expect(chunks.length).toBe(5)

      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types.filter((t) => t === FRAME_TYPE_JSON).length).toBe(1)
      expect(types.filter((t) => t === FRAME_TYPE_CHUNK).length).toBe(2)
      expect(types.filter((t) => t === FRAME_TYPE_END).length).toBe(2)
    })

    it('should interleave initial and late streams', async () => {
      let resolveJson: () => void
      const jsonGate = new Promise<void>((r) => (resolveJson = r))

      // Initial raw stream
      const initialRaw = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          controller.close()
        },
      })

      const recordStream = new ReadableStream<MultiplexedStreamRecord>({
        async start(controller) {
          controller.enqueue(
            createRecord('{"first":true}', [{ id: 1, stream: initialRaw }]),
          )
          await jsonGate
          controller.enqueue(
            createRecord('{"second":true}', [
              {
                id: 2,
                stream: new ReadableStream<Uint8Array>({
                  start(c) {
                    c.enqueue(new Uint8Array([2]))
                    c.close()
                  },
                }),
              },
            ]),
          )
          controller.close()
        },
      })

      const multiplexed = createMultiplexedStream(recordStream)

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      // Read the first record and its stream.
      for (let i = 0; i < 3; i++) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }

      // Release JSON to complete
      resolveJson!()

      // Read remaining
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have: 2 JSON + 2 CHUNK + 2 END = 6 frames
      expect(chunks.length).toBe(6)

      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types.filter((t) => t === FRAME_TYPE_JSON).length).toBe(2)
      expect(types.filter((t) => t === FRAME_TYPE_CHUNK).length).toBe(2)
      expect(types.filter((t) => t === FRAME_TYPE_END).length).toBe(2)
    })

    it('should handle raw stream error', async () => {
      const errorStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('Stream failed'))
        },
      })

      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{}', [{ id: 10, stream: errorStream }]),
        ]),
      )

      const reader = multiplexed.getReader()
      const chunks: Array<Uint8Array> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Should have JSON frame and ERROR frame
      const types = chunks.map((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0)
      })

      expect(types).toContain(FRAME_TYPE_JSON)
      expect(types).toContain(FRAME_TYPE_ERROR)

      // Find ERROR frame and check content
      const errorFrame = chunks.find((chunk) => {
        const view = new DataView(chunk.buffer, chunk.byteOffset)
        return view.getUint8(0) === FRAME_TYPE_ERROR
      })

      expect(errorFrame).toBeDefined()
      const payload = errorFrame!.slice(FRAME_HEADER_SIZE)
      expect(new TextDecoder().decode(payload)).toBe('Stream failed')
    })

    it('should propagate JSON stream error to output (fatal)', async () => {
      let errorController: ReadableStreamDefaultController<MultiplexedStreamRecord>
      const recordStream = new ReadableStream<MultiplexedStreamRecord>({
        start(controller) {
          errorController = controller
        },
      })

      const rawStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Slow stream - should be cancelled when JSON errors
          await new Promise((r) => setTimeout(r, 100))
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      errorController!.enqueue(
        createRecord('{"first":true}', [{ id: 1, stream: rawStream }]),
      )

      const multiplexed = createMultiplexedStream(recordStream)
      const reader = multiplexed.getReader()

      // Should be able to read first JSON frame
      const { value: firstChunk } = await reader.read()
      expect(firstChunk).toBeDefined()
      const view = new DataView(firstChunk!.buffer, firstChunk!.byteOffset)
      expect(view.getUint8(0)).toBe(FRAME_TYPE_JSON)

      // Now error the JSON stream
      errorController!.error(new Error('JSON serialization failed'))

      // Next read should throw the JSON stream error
      await expect(reader.read()).rejects.toThrow('JSON serialization failed')
    })

    it('should not hang when raw stream never ends', async () => {
      // This tests the fix for hanging requests
      let rawStreamCancelled = false
      const neverEndingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          // Never close or error - simulates a hanging stream
        },
        cancel() {
          rawStreamCancelled = true
        },
      })

      const multiplexed = createMultiplexedStream(
        createRecordStream([
          createRecord('{}', [{ id: 1, stream: neverEndingStream }]),
        ]),
      )
      const reader = multiplexed.getReader()

      // Read first two frames (JSON and CHUNK)
      const { value: jsonFrame } = await reader.read()
      expect(jsonFrame).toBeDefined()

      const { value: chunkFrame } = await reader.read()
      expect(chunkFrame).toBeDefined()

      // Cancel the output stream
      await reader.cancel()

      // The underlying raw stream should be cancelled
      expect(rawStreamCancelled).toBe(true)
    })
  })
})
