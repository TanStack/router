import { describe, expect, it } from 'vitest'
import { createFrameDecoder } from '../src/client-rpc/frame-decoder'
import { FRAME_HEADER_SIZE, FrameType } from '../src/constants'

/**
 * Helper to encode a frame for testing
 */
function encodeFrame(
  type: number,
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

function encodeJSONFrame(json: string): Uint8Array {
  return encodeFrame(FrameType.JSON, 0, new TextEncoder().encode(json))
}

function encodeChunkFrame(streamId: number, data: Uint8Array): Uint8Array {
  return encodeFrame(FrameType.CHUNK, streamId, data)
}

function encodeEndFrame(streamId: number): Uint8Array {
  return encodeFrame(FrameType.END, streamId, new Uint8Array(0))
}

function encodeErrorFrame(streamId: number, message: string): Uint8Array {
  return encodeFrame(
    FrameType.ERROR,
    streamId,
    new TextEncoder().encode(message),
  )
}

describe('frame-decoder', () => {
  describe('createFrameDecoder', () => {
    it('should decode JSON frames', async () => {
      const frame1 = encodeJSONFrame('{"line":1}\n')
      const frame2 = encodeJSONFrame('{"line":2}\n')

      const combinedFrames = new Uint8Array(frame1.length + frame2.length)
      combinedFrames.set(frame1, 0)
      combinedFrames.set(frame2, frame1.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combinedFrames)
          controller.close()
        },
      })

      const { jsonChunks } = createFrameDecoder(input)

      const reader = jsonChunks.getReader()
      const chunks: Array<string> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(chunks).toEqual(['{"line":1}\n', '{"line":2}\n'])
    })

    it('should decode raw stream chunks', async () => {
      const jsonFrame = encodeJSONFrame('{}\n')
      const chunkFrame = encodeChunkFrame(5, new Uint8Array([1, 2, 3]))
      const endFrame = encodeEndFrame(5)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const { jsonChunks, getOrCreateStream } = createFrameDecoder(input)

      // Pre-create the stream before consuming
      const stream5 = getOrCreateStream(5)

      // Consume JSON first
      const jsonReader = jsonChunks.getReader()
      const { value: jsonValue } = await jsonReader.read()
      expect(jsonValue).toBe('{}\n')

      // Read the raw stream
      const rawReader = stream5.getReader()
      const { value: rawValue, done: rawDone } = await rawReader.read()

      expect(rawDone).toBe(false)
      expect(rawValue).toEqual(new Uint8Array([1, 2, 3]))

      const { done: finalDone } = await rawReader.read()
      expect(finalDone).toBe(true)
    })

    it('should handle partial frames across chunks', async () => {
      const frame = encodeJSONFrame('{"test":"data"}\n')

      // Split frame in the middle
      const part1 = frame.slice(0, 5)
      const part2 = frame.slice(5)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(part1)
          controller.enqueue(part2)
          controller.close()
        },
      })

      const { jsonChunks } = createFrameDecoder(input)

      const reader = jsonChunks.getReader()
      const chunks: Array<string> = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(chunks).toEqual(['{"test":"data"}\n'])
    })

    it('should handle multiple raw streams', async () => {
      const jsonFrame = encodeJSONFrame('{}\n')
      const chunk1 = encodeChunkFrame(1, new Uint8Array([10]))
      const chunk2 = encodeChunkFrame(2, new Uint8Array([20]))
      const end1 = encodeEndFrame(1)
      const end2 = encodeEndFrame(2)

      const totalLen =
        jsonFrame.length +
        chunk1.length +
        chunk2.length +
        end1.length +
        end2.length
      const combined = new Uint8Array(totalLen)
      let offset = 0
      for (const frame of [jsonFrame, chunk1, chunk2, end1, end2]) {
        combined.set(frame, offset)
        offset += frame.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(input)

      // Pre-create streams before consuming
      const stream1 = getOrCreateStream(1)
      const stream2 = getOrCreateStream(2)

      // Drain JSON
      const jsonReader = jsonChunks.getReader()
      await jsonReader.read()

      // Read stream 1
      const reader1 = stream1.getReader()
      const { value: val1 } = await reader1.read()
      expect(val1).toEqual(new Uint8Array([10]))

      // Read stream 2
      const reader2 = stream2.getReader()
      const { value: val2 } = await reader2.read()
      expect(val2).toEqual(new Uint8Array([20]))
    })

    it('should handle error frames for existing streams', async () => {
      const jsonFrame = encodeJSONFrame('{}\n')
      // Create a stream, then error it immediately
      const chunkFrame = encodeChunkFrame(3, new Uint8Array([1]))
      const errorFrame = encodeErrorFrame(3, 'Stream failed')

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + errorFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(errorFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(input)

      // Pre-create stream 3
      const stream3 = getOrCreateStream(3)

      // Drain JSON
      const jsonReader = jsonChunks.getReader()
      await jsonReader.read()

      const reader = stream3.getReader()

      // Stream was created but then errored
      // Reading should throw the error
      let errorCaught = false
      let chunkReceived = false
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) chunkReceived = true
        }
      } catch (error) {
        errorCaught = true
        expect((error as Error).message).toBe('Stream failed')
      }

      // Either we got the chunk before error, or we got error immediately
      // The important thing is that the error was thrown
      expect(errorCaught).toBe(true)
    })

    it('should preserve stream after END frame for late consumers', async () => {
      // This tests the race condition fix: stream should still be available
      // even if END frame is processed before getOrCreateStream is called
      const jsonFrame = encodeJSONFrame('{"streamRef":7}\n')
      const chunkFrame = encodeChunkFrame(7, new Uint8Array([42, 43, 44]))
      const endFrame = encodeEndFrame(7)

      const combined = new Uint8Array(
        jsonFrame.length + chunkFrame.length + endFrame.length,
      )
      combined.set(jsonFrame, 0)
      combined.set(chunkFrame, jsonFrame.length)
      combined.set(endFrame, jsonFrame.length + chunkFrame.length)

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(input)

      // First, fully consume JSON stream (this processes all frames)
      const jsonReader = jsonChunks.getReader()
      const chunks: Array<string> = []
      while (true) {
        const { done, value } = await jsonReader.read()
        if (done) break
        chunks.push(value)
      }
      expect(chunks).toEqual(['{"streamRef":7}\n'])

      // Now call getOrCreateStream AFTER all frames processed (including END)
      // This simulates deserializer calling getOrCreateStream late
      const stream7 = getOrCreateStream(7)

      // The stream should still have the data that was enqueued
      const rawReader = stream7.getReader()
      const { value, done } = await rawReader.read()

      expect(done).toBe(false)
      expect(value).toEqual(new Uint8Array([42, 43, 44]))

      // Next read should be done (stream was closed by END frame)
      const { done: finalDone } = await rawReader.read()
      expect(finalDone).toBe(true)
    })

    it('should handle CHUNK creating stream before getOrCreateStream called', async () => {
      // CHUNK frame arrives first and creates stream internally,
      // then getOrCreateStream returns the same stream with data
      const chunkFrame1 = encodeChunkFrame(9, new Uint8Array([1, 2]))
      const chunkFrame2 = encodeChunkFrame(9, new Uint8Array([3, 4]))
      const endFrame = encodeEndFrame(9)
      const jsonFrame = encodeJSONFrame('{"ref":9}\n')

      // Order: CHUNK, CHUNK, END, then JSON (unusual but valid)
      const combined = new Uint8Array(
        chunkFrame1.length +
          chunkFrame2.length +
          endFrame.length +
          jsonFrame.length,
      )
      let offset = 0
      for (const frame of [chunkFrame1, chunkFrame2, endFrame, jsonFrame]) {
        combined.set(frame, offset)
        offset += frame.length
      }

      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(combined)
          controller.close()
        },
      })

      const { getOrCreateStream, jsonChunks } = createFrameDecoder(input)

      // Drain JSON (processes all frames)
      const jsonReader = jsonChunks.getReader()
      while (true) {
        const { done } = await jsonReader.read()
        if (done) break
      }

      // Now get the stream - should have all the data
      const stream9 = getOrCreateStream(9)
      const reader = stream9.getReader()

      const { value: v1 } = await reader.read()
      expect(v1).toEqual(new Uint8Array([1, 2]))

      const { value: v2 } = await reader.read()
      expect(v2).toEqual(new Uint8Array([3, 4]))

      const { done: finalDone } = await reader.read()
      expect(finalDone).toBe(true)
    })
  })
})
