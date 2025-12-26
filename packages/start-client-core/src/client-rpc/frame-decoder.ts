/**
 * Client-side frame decoder for multiplexed responses.
 *
 * Decodes the binary frame protocol and reconstructs:
 * - JSON stream (NDJSON lines for seroval)
 * - Raw streams (binary data as ReadableStream<Uint8Array>)
 */

import { FRAME_HEADER_SIZE, FrameType } from '../constants'

/** Cached TextDecoder for frame decoding */
const textDecoder = new TextDecoder()

/** Shared empty buffer for empty buffer case - avoids allocation */
const EMPTY_BUFFER = new Uint8Array(0)

/**
 * Result of frame decoding.
 */
export interface FrameDecoderResult {
  /** Gets or creates a raw stream by ID (for use by deserialize plugin) */
  getOrCreateStream: (id: number) => ReadableStream<Uint8Array>
  /** Stream of JSON strings (NDJSON lines) */
  jsonChunks: ReadableStream<string>
}

/**
 * Creates a frame decoder that processes a multiplexed response stream.
 *
 * @param input The raw response body stream
 * @returns Decoded JSON stream and stream getter function
 */
export function createFrameDecoder(
  input: ReadableStream<Uint8Array>,
): FrameDecoderResult {
  const streamControllers = new Map<
    number,
    ReadableStreamDefaultController<Uint8Array>
  >()
  const streams = new Map<number, ReadableStream<Uint8Array>>()

  let jsonController!: ReadableStreamDefaultController<string>
  const jsonChunks = new ReadableStream<string>({
    start(controller) {
      jsonController = controller
    },
  })

  /**
   * Gets or creates a stream for a given stream ID.
   * Called by deserialize plugin when it encounters a RawStream reference.
   */
  function getOrCreateStream(id: number): ReadableStream<Uint8Array> {
    let stream = streams.get(id)
    if (!stream) {
      stream = new ReadableStream<Uint8Array>({
        start(ctrl) {
          streamControllers.set(id, ctrl)
        },
      })
      streams.set(id, stream)
    }
    return stream
  }

  /**
   * Gets controller for an existing stream (for frame processing).
   */
  function getController(
    id: number,
  ): ReadableStreamDefaultController<Uint8Array> | undefined {
    return streamControllers.get(id)
  }

  /**
   * Ensures stream exists and returns its controller for enqueuing data.
   * Used for CHUNK frames where we need to ensure stream is created.
   */
  function ensureController(
    id: number,
  ): ReadableStreamDefaultController<Uint8Array> | undefined {
    getOrCreateStream(id)
    return streamControllers.get(id)
  }

  // Process frames asynchronously
  ;(async () => {
    const reader = input.getReader()
    // Use buffer list to avoid O(n²) concatenation - only flatten when needed
    const bufferList: Array<Uint8Array> = []
    let totalLength = 0

    // Flattens buffer list into single Uint8Array when we need to parse
    function flattenBuffer(): Uint8Array {
      if (bufferList.length === 0) return EMPTY_BUFFER
      if (bufferList.length === 1) return bufferList[0]!
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of bufferList) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      bufferList.length = 0
      bufferList.push(result)
      return result
    }

    // Consumes bytes from the front of the buffer (buffer must already be flattened)
    function consumeBytes(buffer: Uint8Array, count: number): void {
      // Use slice (not subarray) to release memory of consumed portion
      const remaining = buffer.slice(count)
      bufferList.length = 0
      if (remaining.length > 0) {
        bufferList.push(remaining)
      }
      totalLength -= count
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Append incoming chunk to buffer list
        bufferList.push(value)
        totalLength += value.length

        // Parse complete frames from buffer
        while (totalLength >= FRAME_HEADER_SIZE) {
          // Flatten once per iteration, reuse for header read and consume
          const buffer = flattenBuffer()
          // Read header bytes directly to avoid DataView allocation per frame
          // Frame format: [type:1][streamId:4 BE][length:4 BE]
          const type = buffer[0]!
          // Use >>> 0 to ensure unsigned 32-bit result (avoids negative for high bit set)
          const streamId =
            ((buffer[1]! << 24) |
              (buffer[2]! << 16) |
              (buffer[3]! << 8) |
              buffer[4]!) >>>
            0
          const length =
            ((buffer[5]! << 24) |
              (buffer[6]! << 16) |
              (buffer[7]! << 8) |
              buffer[8]!) >>>
            0

          const frameSize = FRAME_HEADER_SIZE + length
          // Check if we have the complete frame
          if (totalLength < frameSize) {
            break // Wait for more data
          }

          // Extract payload
          const payload = buffer.slice(FRAME_HEADER_SIZE, frameSize)
          consumeBytes(buffer, frameSize)

          // Process frame by type
          switch (type) {
            case FrameType.JSON:
              jsonController.enqueue(textDecoder.decode(payload))
              break

            case FrameType.CHUNK: {
              // Ensure stream exists and get controller to enqueue data
              const ctrl = ensureController(streamId)
              if (ctrl) {
                ctrl.enqueue(payload)
              }
              break
            }

            case FrameType.END: {
              const ctrl = getController(streamId)
              if (ctrl) {
                try {
                  ctrl.close()
                } catch {
                  // Already closed
                }
                streamControllers.delete(streamId)
                // Note: Do NOT delete from streams map - the app still needs to consume it
              }
              break
            }

            case FrameType.ERROR: {
              const ctrl = getController(streamId)
              if (ctrl) {
                const message = textDecoder.decode(payload)
                ctrl.error(new Error(message))
                streamControllers.delete(streamId)
                // Note: Do NOT delete from streams map - the app still needs to consume it
              }
              break
            }
          }
        }
      }

      // Close JSON stream when done
      jsonController.close()

      // Close any remaining streams (shouldn't happen in normal operation)
      // Note: We don't clear streams map - app may still need to consume them
      streamControllers.forEach((ctrl) => {
        try {
          ctrl.close()
        } catch {
          // Already closed
        }
      })
      streamControllers.clear()
    } catch (error) {
      // Error reading - propagate to all streams
      try {
        jsonController.error(error)
      } catch {
        // Already errored/closed
      }
      streamControllers.forEach((ctrl) => {
        try {
          ctrl.error(error)
        } catch {
          // Already errored/closed
        }
      })
      streamControllers.clear()
    } finally {
      reader.releaseLock()
    }
  })()

  return { getOrCreateStream, jsonChunks }
}
