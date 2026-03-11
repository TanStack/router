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
import { FRAME_HEADER_SIZE, FrameType } from '@tanstack/start-client-core'

export {
  FRAME_HEADER_SIZE,
  FrameType,
  TSS_CONTENT_TYPE_FRAMED,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  TSS_FRAMED_PROTOCOL_VERSION,
} from '@tanstack/start-client-core'

/** Cached TextEncoder for frame encoding */
const textEncoder = new TextEncoder()

/** Shared empty payload for END frames - avoids allocation per call */
const EMPTY_PAYLOAD = new Uint8Array(0)

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
  frame[1] = (streamId >>> 24) & 0xff
  frame[2] = (streamId >>> 16) & 0xff
  frame[3] = (streamId >>> 8) & 0xff
  frame[4] = streamId & 0xff
  frame[5] = (payload.length >>> 24) & 0xff
  frame[6] = (payload.length >>> 16) & 0xff
  frame[7] = (payload.length >>> 8) & 0xff
  frame[8] = payload.length & 0xff
  frame.set(payload, FRAME_HEADER_SIZE)
  return frame
}

/**
 * Encodes a JSON frame (type 0, streamId 0).
 */
export function encodeJSONFrame(json: string): Uint8Array {
  return encodeFrame(FrameType.JSON, 0, textEncoder.encode(json))
}

/**
 * Encodes a raw stream chunk frame.
 */
export function encodeChunkFrame(
  streamId: number,
  chunk: Uint8Array,
): Uint8Array {
  return encodeFrame(FrameType.CHUNK, streamId, chunk)
}

/**
 * Encodes a raw stream end frame.
 */
export function encodeEndFrame(streamId: number): Uint8Array {
  return encodeFrame(FrameType.END, streamId, EMPTY_PAYLOAD)
}

/**
 * Encodes a raw stream error frame.
 */
export function encodeErrorFrame(streamId: number, error: unknown): Uint8Array {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  return encodeFrame(FrameType.ERROR, streamId, textEncoder.encode(message))
}

/**
 * Creates a multiplexed ReadableStream from JSON stream and raw streams.
 *
 * The JSON stream emits NDJSON lines (from seroval's toCrossJSONStream).
 * Raw streams are pumped concurrently, interleaved with JSON frames.
 *
 * @param jsonStream Stream of JSON strings (each string is one NDJSON line)
 * @param rawStreams Map of stream IDs to raw binary streams
 */
export function createMultiplexedStream(
  jsonStream: ReadableStream<string>,
  rawStreams: Map<number, ReadableStream<Uint8Array>>,
): ReadableStream<Uint8Array> {
  // Track active pumps for completion
  let activePumps = 1 + rawStreams.size // 1 for JSON + raw streams
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  let cancelled = false as boolean
  const cancelReaders: Array<() => void> = []

  const safeEnqueue = (chunk: Uint8Array) => {
    if (cancelled || !controllerRef) return
    try {
      controllerRef.enqueue(chunk)
    } catch {
      // Ignore enqueue after close/cancel
    }
  }

  const safeError = (err: unknown) => {
    if (cancelled || !controllerRef) return
    try {
      controllerRef.error(err)
    } catch {
      // Ignore
    }
  }

  const safeClose = () => {
    if (cancelled || !controllerRef) return
    try {
      controllerRef.close()
    } catch {
      // Ignore
    }
  }

  const checkComplete = () => {
    activePumps--
    if (activePumps === 0) {
      safeClose()
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      cancelReaders.length = 0

      // Pump JSON stream (streamId 0)
      const pumpJSON = async () => {
        const reader = jsonStream.getReader()
        cancelReaders.push(() => {
          // Catch async rejection - reader may already be released
          reader.cancel().catch(() => {})
        })
        try {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          while (true) {
            const { done, value } = await reader.read()
            // Check cancelled after await - flag may have changed while waiting
            if (cancelled) break
            if (done) break
            safeEnqueue(encodeJSONFrame(value))
          }
        } catch (error) {
          // JSON stream error - fatal, error the whole response
          safeError(error)
        } finally {
          reader.releaseLock()
          checkComplete()
        }
      }

      // Pump a single raw stream with its streamId
      const pumpRawStream = async (
        streamId: number,
        stream: ReadableStream<Uint8Array>,
      ) => {
        const reader = stream.getReader()
        cancelReaders.push(() => {
          // Catch async rejection - reader may already be released
          reader.cancel().catch(() => {})
        })
        try {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          while (true) {
            const { done, value } = await reader.read()
            // Check cancelled after await - flag may have changed while waiting
            if (cancelled) break
            if (done) {
              safeEnqueue(encodeEndFrame(streamId))
              break
            }
            safeEnqueue(encodeChunkFrame(streamId, value))
          }
        } catch (error) {
          // Stream error - send ERROR frame (non-fatal, other streams continue)
          safeEnqueue(encodeErrorFrame(streamId, error))
        } finally {
          reader.releaseLock()
          checkComplete()
        }
      }

      // Start all pumps concurrently
      pumpJSON()
      for (const [streamId, stream] of rawStreams) {
        pumpRawStream(streamId, stream)
      }
    },

    cancel() {
      cancelled = true
      controllerRef = null
      // Proactively cancel all underlying readers to stop work quickly.
      for (const cancelReader of cancelReaders) {
        cancelReader()
      }
      cancelReaders.length = 0
    },
  })
}
