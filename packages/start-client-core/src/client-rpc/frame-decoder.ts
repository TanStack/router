/**
 * Client-side frame decoder for multiplexed responses.
 *
 * Decodes binary frame protocol and reconstructs:
 * - JSON stream (one complete Seroval value per frame)
 * - Raw streams (binary data as ReadableStream<Uint8Array>)
 */

import {
  FRAME_HEADER_SIZE,
  FrameType,
  MAX_FRAMED_STREAMS,
  MAX_FRAME_PAYLOAD_SIZE,
} from '../constants'

/** Cached TextDecoder for frame decoding */
const textDecoder = new TextDecoder()

/** Shared empty buffer for empty buffer case - avoids allocation */
const EMPTY_BUFFER = new Uint8Array(0)

const MAX_QUEUED_BYTES =
  FRAME_HEADER_SIZE + MAX_FRAME_PAYLOAD_SIZE * 2

type RawStreamState = [
  stream: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  terminal: boolean | undefined,
  queuedBytes: number,
]

/**
 * Result of frame decoding.
 */
export interface FrameDecoderResult {
  /** Gets or creates a raw stream by ID (for use by deserialize plugin) */
  getOrCreateStream: (id: number) => ReadableStream<Uint8Array>
  /** Stream of complete JSON strings */
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
  const reader = input.getReader()
  const streams = new Map<number, RawStreamState>()

  let stopped: [unknown] | undefined
  let queuedBytes = 0

  const updateQueuedBytes = <T>(
    controller: ReadableStreamDefaultController<T>,
    previous: number,
  ): number => {
    const next = MAX_QUEUED_BYTES - controller.desiredSize!
    queuedBytes += next - previous
    return next
  }

  const assertQueueBudget = (): void => {
    if (queuedBytes > MAX_QUEUED_BYTES) {
      throw new Error(
        `Framed response queue exceeded ${MAX_QUEUED_BYTES} bytes`,
      )
    }
  }

  const errorStream = (state: RawStreamState, error: unknown): void => {
    queuedBytes -= state[3]
    state[3] = 0
    state[2] = true
    state[1].error(error)
  }

  const errorActiveStreams = (error: unknown): void => {
    for (const state of streams.values()) {
      if (!state[2]) {
        errorStream(state, error)
      }
    }
  }

  function getOrCreateState(id: number): RawStreamState {
    const existing = streams.get(id)
    if (existing) {
      return existing
    }

    if (streams.size >= MAX_FRAMED_STREAMS) {
      throw new Error(
        `Too many raw streams in framed response (max ${MAX_FRAMED_STREAMS})`,
      )
    }

    const terminal = stopped
    // Assigned after stream construction so its callbacks can close over it.
    // eslint-disable-next-line prefer-const
    let state!: RawStreamState
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>(
      {
        start(ctrl) {
          controller = ctrl
          if (terminal) {
            ctrl.error(terminal[0])
          }
        },
        cancel() {
          queuedBytes -= state[3]
          state[3] = 0
          state[2] = true
        },
        pull() {
          state[3] = updateQueuedBytes(controller, state[3])
          if (state[2] && !state[3]) {
            controller.close()
          }
        },
      },
      {
        highWaterMark: MAX_QUEUED_BYTES,
        size(chunk) {
          return FRAME_HEADER_SIZE + chunk.byteLength
        },
      },
    )
    state = [stream, controller, !!terminal, 0]
    streams.set(id, state)
    return state
  }

  function getOrCreateStream(id: number): ReadableStream<Uint8Array> {
    return getOrCreateState(id)[0]
  }

  let jsonController!: ReadableStreamDefaultController<string>
  let queuedJSONBytes = 0
  const jsonChunks = new ReadableStream<string>(
    {
      start(controller) {
        jsonController = controller
      },
      cancel(reason) {
        const error = reason ?? new Error('Framed response cancelled')
        stopped = [error]
        errorActiveStreams(error)
        streams.clear()
        return reader.cancel(reason).catch(() => {})
      },
      pull() {
        queuedJSONBytes = updateQueuedBytes(jsonController, queuedJSONBytes)
      },
    },
    {
      highWaterMark: MAX_QUEUED_BYTES,
      size(value) {
        return FRAME_HEADER_SIZE + value.length * 2
      },
    },
  )

  // Process frames asynchronously
  ;(async () => {
    const bufferList: Array<Uint8Array> = []
    let totalLength = 0
    let pendingType = -1
    let pendingStreamId = 0
    let pendingLength = 0

    /**
     * Flattens buffer list into single Uint8Array and removes from list.
     */
    function extractFlattened(count: number): Uint8Array {
      if (count === 0) {
        return EMPTY_BUFFER
      }

      // Fast path: the requested bytes are fully contained in the first buffered
      // chunk (the common case — most frames arrive within a single network
      // read). Return a subarray view instead of allocating a new buffer and
      // copying `count` bytes. The view shares the chunk's backing ArrayBuffer,
      // which is safe because buffered chunks are never mutated in place after
      // being read from the network.
      const first = bufferList[0]!
      if (first.length >= count) {
        const result = first.subarray(0, count)
        if (first.length === count) {
          bufferList.shift()
        } else {
          bufferList[0] = first.subarray(count)
        }
        totalLength -= count
        return result
      }

      // Slow path: the requested bytes span multiple chunks — flatten by copying.
      const result = new Uint8Array(count)
      let offset = 0
      let remaining = count

      while (remaining > 0) {
        const chunk = bufferList[0]!
        const toCopy = Math.min(chunk.length, remaining)
        result.set(chunk.subarray(0, toCopy), offset)

        offset += toCopy
        remaining -= toCopy

        if (toCopy === chunk.length) {
          bufferList.shift()
        } else {
          bufferList[0] = chunk.subarray(toCopy)
        }
      }

      totalLength -= count
      return result
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read()
        if (stopped) {
          break
        }
        if (done) {
          break
        }

        // Append incoming chunk to buffer list
        bufferList.push(value)
        totalLength += value.length

        // Parse complete frames from buffer
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          if (pendingType < 0) {
            if (totalLength < FRAME_HEADER_SIZE) {
              break
            }

            const header = extractFlattened(FRAME_HEADER_SIZE)
            pendingType = header[0]!
            pendingStreamId =
              ((header[1]! << 24) |
                (header[2]! << 16) |
                (header[3]! << 8) |
                header[4]!) >>>
              0
            pendingLength =
              ((header[5]! << 24) |
                (header[6]! << 16) |
                (header[7]! << 8) |
                header[8]!) >>>
              0

            if (pendingType > FrameType.ERROR) {
              throw new Error(`Unknown frame type: ${pendingType}`)
            }

            // JSON uses stream ID 0; raw streams use non-zero IDs.
            if (
              pendingType === FrameType.JSON
                ? pendingStreamId !== 0
                : pendingStreamId === 0
            ) {
              throw new Error(
                pendingType === FrameType.JSON
                  ? 'Invalid JSON frame streamId (expected 0)'
                  : 'Invalid raw frame streamId (expected non-zero)',
              )
            }

            if (pendingLength > MAX_FRAME_PAYLOAD_SIZE) {
              throw new Error(
                `Frame payload too large: ${pendingLength} bytes (max ${MAX_FRAME_PAYLOAD_SIZE})`,
              )
            }
          }

          if (totalLength < pendingLength) {
            break
          }

          const type = pendingType
          const streamId = pendingStreamId
          pendingType = -1
          const payload = extractFlattened(pendingLength)

          // Process frame by type
          switch (type) {
            case FrameType.JSON: {
              const value = textDecoder.decode(payload)
              jsonController.enqueue(value)
              queuedJSONBytes = updateQueuedBytes(
                jsonController,
                queuedJSONBytes,
              )
              assertQueueBudget()
              break
            }

            case FrameType.CHUNK: {
              const state = getOrCreateState(streamId)
              if (!state[2]) {
                state[1].enqueue(payload.slice())
                state[3] = updateQueuedBytes(state[1], state[3])
                assertQueueBudget()
              }
              break
            }

            case FrameType.END: {
              const state = getOrCreateState(streamId)
              if (!state[2]) {
                state[2] = true
                if (!state[3]) {
                  state[1].close()
                }
              }
              break
            }

            case FrameType.ERROR: {
              const state = getOrCreateState(streamId)
              if (!state[2]) {
                errorStream(state, new Error(textDecoder.decode(payload)))
              }
              break
            }
          }
        }
      }

      if (stopped) {
        return
      }

      if (pendingType >= 0 || totalLength) {
        throw new Error('Incomplete frame at end of framed response')
      }

      const missingEnd = new Error(
        'Framed response ended before raw stream END',
      )
      stopped = [missingEnd]
      errorActiveStreams(missingEnd)

      // Close JSON stream when done
      jsonController.close()
    } catch (error) {
      stopped = [error]
      // Error reading - propagate to all streams
      jsonController.error(error)
      errorActiveStreams(error)
      void reader.cancel(error).catch(() => {})
    } finally {
      reader.releaseLock()
    }
  })()

  return { getOrCreateStream, jsonChunks }
}
