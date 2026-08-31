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
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAMED_STREAMS,
  MAX_FRAME_PAYLOAD_SIZE,
} from '@tanstack/start-client-core'

export {
  FRAME_HEADER_SIZE,
  FRAME_TYPE_CHUNK,
  FRAME_TYPE_END,
  FRAME_TYPE_ERROR,
  FRAME_TYPE_JSON,
  MAX_FRAME_PAYLOAD_SIZE,
  MAX_FRAMED_STREAMS,
  TSS_CONTENT_TYPE_FRAMED,
  TSS_CONTENT_TYPE_FRAMED_VERSIONED,
  TSS_FRAMED_PROTOCOL_VERSION,
} from '@tanstack/start-client-core'

type FrameType =
  | typeof FRAME_TYPE_JSON
  | typeof FRAME_TYPE_CHUNK
  | typeof FRAME_TYPE_END
  | typeof FRAME_TYPE_ERROR

/** Cached TextEncoder for frame encoding */
const textEncoder = new TextEncoder()

/** Shared empty payload for END frames - avoids allocation per call */
const EMPTY_PAYLOAD = new Uint8Array(0)
const MAX_ERROR_MESSAGE_CODE_UNITS = 4096

/**
 * Encodes a single frame with header and payload.
 */
export function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  if (payload.byteLength > MAX_FRAME_PAYLOAD_SIZE) {
    throw new RangeError(
      `Frame payload exceeds ${MAX_FRAME_PAYLOAD_SIZE} bytes`,
    )
  }
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
 * Encodes a raw stream chunk frame.
 */
export function encodeChunkFrame(
  streamId: number,
  chunk: Uint8Array,
): Uint8Array {
  return encodeFrame(FRAME_TYPE_CHUNK, streamId, chunk)
}

/**
 * Encodes a raw stream end frame.
 */
export function encodeEndFrame(streamId: number): Uint8Array {
  return encodeFrame(FRAME_TYPE_END, streamId, EMPTY_PAYLOAD)
}

/**
 * Encodes a raw stream error frame.
 */
export function encodeErrorFrame(streamId: number, error: unknown): Uint8Array {
  const originalMessage =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')
  const message =
    originalMessage.length > MAX_ERROR_MESSAGE_CODE_UNITS
      ? `${originalMessage.slice(0, MAX_ERROR_MESSAGE_CODE_UNITS)}…`
      : originalMessage
  return encodeFrame(FRAME_TYPE_ERROR, streamId, textEncoder.encode(message))
}

/**
 * Late stream registration for RawStreams discovered after serialization starts.
 * Used when Promise<RawStream> resolves after the initial synchronous pass.
 */
export interface LateStreamRegistration {
  id: number
  stream: ReadableStream<Uint8Array>
}

/** One serialized JSON patch and the raw streams referenced by that patch. */
export interface MultiplexedStreamRecord {
  json: Uint8Array
  rawStreams: Array<LateStreamRegistration>
}

export interface MultiplexedStreamOptions {
  onCancel?: (reason?: unknown) => void
  signal?: AbortSignal
}

type CancellableReader = Pick<
  ReadableStreamDefaultReader<unknown>,
  'cancel' | 'releaseLock'
>

/**
 * Creates a multiplexed ReadableStream from serialized response records.
 *
 * A record's JSON frame is admitted before any raw stream referenced by that
 * record starts. Raw streams from admitted records are pumped concurrently.
 */
export function createMultiplexedStream(
  recordStream: ReadableStream<MultiplexedStreamRecord>,
  options: MultiplexedStreamOptions = {},
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array>
  let stopped: false | [unknown] = false
  let activePumps = 0
  let streamCount = 0
  let wakeDemand: (() => void) | undefined
  let admission = Promise.resolve()
  const readers = new Set<CancellableReader>()
  const pendingRawStreams = new Set<ReadableStream<Uint8Array>>()
  const abortOutput = () => errorOutput(options.signal?.reason)

  const wakeAdmission = () => {
    const wake = wakeDemand
    wakeDemand = undefined
    wake?.()
  }

  const cancelReader = (reader: CancellableReader, reason?: unknown) => {
    void reader.cancel(reason).catch(() => {})
  }

  const cancelStream = (stream: ReadableStream<unknown>, reason?: unknown) => {
    void stream.cancel(reason).catch(() => {})
  }

  const cancelReaders = (reason?: unknown) => {
    for (const reader of readers) {
      cancelReader(reader, reason)
    }
  }

  const stop = (reason?: unknown) => {
    if (stopped) {
      return false
    }
    stopped = [reason]
    options.signal?.removeEventListener('abort', abortOutput)
    wakeAdmission()
    cancelReaders(reason)
    for (const stream of pendingRawStreams) {
      cancelStream(stream, reason)
    }
    pendingRawStreams.clear()
    return true
  }

  const errorOutput = (error: unknown) => {
    if (!stop(error)) {
      return
    }
    try {
      controller.error(error)
    } catch {
      // The output was already closed by its consumer.
    }
  }

  const waitForDemand = async () => {
    while (!stopped && (controller.desiredSize ?? 0) <= 0) {
      await new Promise<void>((resolve) => {
        wakeDemand = resolve
      })
    }
    return !stopped
  }

  // Only the pump at the head of this chain may inspect desiredSize and
  // enqueue. Each other pump can retain at most one unencoded source chunk.
  const admitFrame = (createFrame: () => Uint8Array) => {
    const result = admission.then(async () => {
      if (!(await waitForDemand())) {
        return false
      }
      controller.enqueue(createFrame())
      return true
    })
    admission = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const maybeClose = () => {
    if (activePumps !== 0 || !stop()) {
      return
    }
    try {
      controller.close()
    } catch {
      // The output was already closed by its consumer.
    }
  }

  const startPump = (pump: () => Promise<void>) => {
    activePumps++
    void pump().then(
      () => {
        activePumps--
        maybeClose()
      },
      (error) => {
        activePumps--
        errorOutput(error)
      },
    )
  }

  async function pumpRawStream(
    streamId: number,
    stream: ReadableStream<Uint8Array>,
  ) {
    const reader = stream.getReader()
    readers.add(reader)
    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (stopped) {
          return
        }
        if (done) {
          await admitFrame(() => encodeEndFrame(streamId))
          return
        }
        if (value.byteLength === 0) {
          if (!(await admitFrame(() => encodeChunkFrame(streamId, value)))) {
            return
          }
        } else {
          for (
            let offset = 0;
            offset < value.byteLength;
            offset += MAX_FRAME_PAYLOAD_SIZE
          ) {
            const chunk = value.subarray(
              offset,
              offset + MAX_FRAME_PAYLOAD_SIZE,
            )
            if (!(await admitFrame(() => encodeChunkFrame(streamId, chunk)))) {
              return
            }
          }
        }
      }
    } catch (error) {
      if (!stopped) {
        // A raw-stream failure is isolated to that stream.
        await admitFrame(() => encodeErrorFrame(streamId, error))
      }
    } finally {
      readers.delete(reader)
      reader.releaseLock()
    }
  }

  async function pumpRecords() {
    const reader = recordStream.getReader()
    readers.add(reader)
    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        // Cancellation can run while the read is suspended.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (stopped) {
          if (!done) {
            for (const registration of value.rawStreams) {
              cancelStream(registration.stream, stopped[0])
            }
          }
          return
        }
        if (done) {
          return
        }
        if (streamCount + value.rawStreams.length > MAX_FRAMED_STREAMS) {
          for (const registration of value.rawStreams) {
            cancelStream(registration.stream)
          }
          throw new Error(
            `Too many raw streams in framed response (max ${MAX_FRAMED_STREAMS})`,
          )
        }
        streamCount += value.rawStreams.length
        for (const registration of value.rawStreams) {
          pendingRawStreams.add(registration.stream)
        }
        if (
          !(await admitFrame(() => encodeFrame(FRAME_TYPE_JSON, 0, value.json)))
        ) {
          return
        }
        for (const registration of value.rawStreams) {
          pendingRawStreams.delete(registration.stream)
          startPump(
            pumpRawStream.bind(undefined, registration.id, registration.stream),
          )
        }
      }
    } catch (error) {
      if (!stopped) {
        // JSON records describe the response graph, so losing one is fatal.
        errorOutput(error)
      }
    } finally {
      readers.delete(reader)
      reader.releaseLock()
    }
  }

  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      startPump(pumpRecords)
      if (options.signal?.aborted) {
        errorOutput(options.signal.reason)
        return
      }
      options.signal?.addEventListener('abort', abortOutput, { once: true })
    },
    pull() {
      wakeAdmission()
    },
    cancel(reason) {
      if (stop(reason)) {
        options.onCancel?.(reason)
      }
    },
  })
}
