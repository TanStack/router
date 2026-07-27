/**
 * Binary frame protocol for multiplexing JSON and raw streams over HTTP.
 *
 * Frame format: [type:1][streamId:4][length:4][payload:length]
 * - type: 1 byte - frame type (JSON, CHUNK, END, ERROR)
 * - streamId: 4 bytes big-endian uint32 - stream identifier
 * - length: 4 bytes big-endian uint32 - payload length
 * - payload: variable length bytes
 */

// Re-export constants from shared location
import {
  FRAME_HEADER_SIZE,
  FrameType,
  MAX_FRAME_PAYLOAD_SIZE,
} from '@tanstack/start-client-core'

export {
  FRAME_HEADER_SIZE,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_FRAMED_STREAMS,
  FrameType,
  TSS_CONTENT_TYPE_FRAMED,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  TSS_FRAMED_PROTOCOL_VERSION,
} from '@tanstack/start-client-core'

/** Cached TextEncoder for frame encoding */
const textEncoder = new TextEncoder()

/**
 * Encodes a single frame with header and payload.
 */
export function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
  // Write header bytes directly to avoid DataView allocation per frame
  // Frame format: [type:1][streamId:4 BE][length:4 BE]
  frame[0] = type
  frame[1] = streamId >>> 24
  frame[2] = streamId >>> 16
  frame[3] = streamId >>> 8
  frame[4] = streamId
  frame[5] = payload.length >>> 24
  frame[6] = payload.length >>> 16
  frame[7] = payload.length >>> 8
  frame[8] = payload.length
  frame.set(payload, FRAME_HEADER_SIZE)
  return frame
}

/**
 * Encodes a JSON frame (type 0, streamId 0).
 */
export function encodeJSONFrame(json: string): Uint8Array {
  const payload = textEncoder.encode(json)
  if (payload.length > MAX_FRAME_PAYLOAD_SIZE) {
    throw new RangeError(
      `Frame payload too large: ${payload.length} bytes (max ${MAX_FRAME_PAYLOAD_SIZE})`,
    )
  }
  return encodeFrame(FrameType.JSON, 0, payload)
}

/**
 * Encodes a raw stream error frame.
 */
export function encodeErrorFrame(streamId: number, error: unknown): Uint8Array {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const payload = new Uint8Array(
    Math.min(MAX_FRAME_PAYLOAD_SIZE, message.length * 3),
  )
  const { written } = textEncoder.encodeInto(message, payload)
  return encodeFrame(FrameType.ERROR, streamId, payload.subarray(0, written))
}

export function cancelReadableStream(
  stream: ReadableStream<unknown>,
  reason?: unknown,
): void {
  void stream.cancel(reason).catch(() => {})
}

/**
 * Creates a multiplexed ReadableStream from JSON stream and raw streams.
 *
 * The JSON stream emits pre-encoded JSON frames.
 * Raw streams are pumped concurrently, interleaved with JSON frames.
 */
export function createMultiplexedStream(
  jsonStream: ReadableStream<Uint8Array>,
  rawStreams: Map<number, ReadableStream<Uint8Array>>,
): [
  stream: ReadableStream<Uint8Array>,
  registerRaw: (id: number, stream: ReadableStream<Uint8Array>) => void,
] {
  const transform = new TransformStream<Uint8Array, Uint8Array>()
  const writer = transform.writable.getWriter()
  let terminal = false
  const readers = new Set<ReadableStreamDefaultReader<Uint8Array>>()
  let active = 0

  const stop = (error: unknown): void => {
    if (terminal) {
      return
    }

    terminal = true
    for (const reader of readers) {
      void reader.cancel(error).catch(() => {})
    }
    readers.clear()
    void writer.abort(error).catch(() => {})
  }

  void writer.closed.catch(stop)

  const write = (frame: Uint8Array): Promise<boolean> => {
    return writer.write(frame).then(
      () => true,
      (error) => {
        stop(error)
        return false
      },
    )
  }

  const track = (pump: Promise<void>): void => {
    active++
    void pump.then(() => {
      if (!--active && !terminal) {
        terminal = true
        void writer.close().catch(() => {})
      }
    }, stop)
  }

  // Pumps a raw stream, sending CHUNK frames and END/ERROR on completion
  async function pumpRawStream(
    streamId: number,
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      reader = stream.getReader()
      readers.add(reader)

      while (!terminal) {
        const { done, value } = await reader.read()
        // Cancellation can happen while the read is pending.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (terminal) {
          return
        }
        if (done) {
          await write(
            encodeFrame(FrameType.END, streamId, new Uint8Array()),
          )
          return
        }

        let offset = 0
        do {
          const chunk = value.subarray(
            offset,
            Math.min(offset + MAX_FRAME_PAYLOAD_SIZE, value.length),
          )
          if (!(await write(encodeFrame(FrameType.CHUNK, streamId, chunk)))) {
            return
          }
          offset += MAX_FRAME_PAYLOAD_SIZE
        } while (offset < value.length)
      }
    } catch (error) {
      // Raw stream error - send ERROR frame, don't fail entire response
      if (!terminal) {
        await write(encodeErrorFrame(streamId, error))
      }
    } finally {
      if (reader) {
        readers.delete(reader)
        reader.releaseLock()
      }
    }
  }

  // Pumps the JSON stream, sending JSON frames
  // JSON stream errors are fatal - they error the entire output
  async function pumpJSON(): Promise<void> {
    const reader = jsonStream.getReader()
    readers.add(reader)
    try {
      while (!terminal) {
        const { done, value } = await reader.read()
        // Cancellation can happen while the read is pending.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (terminal) {
          return
        }
        if (done) {
          return
        }

        if (!(await write(value))) {
          return
        }
      }
    } finally {
      readers.delete(reader)
      reader.releaseLock()
    }
  }

  const registerRaw = (
    id: number,
    stream: ReadableStream<Uint8Array>,
  ): void => {
    // Start immediately so output cancellation owns the raw reader. Raw and
    // JSON frame order is intentionally independent.
    track(pumpRawStream(id, stream))
  }

  track(pumpJSON())
  for (const [id, stream] of rawStreams) {
    track(pumpRawStream(id, stream))
  }
  rawStreams.clear()

  return [transform.readable, registerRaw]
}
