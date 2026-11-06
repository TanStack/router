import { createLiveStream, createStream } from 'seroval'

// Web-only primitives shared by the JSON and SSR RawStream plugins. This
// module is part of the client bundle: it must not reference `Buffer`, and
// the encode and decode halves must stay independently tree-shakeable.

export function toBase64(bytes: Uint8Array) {
  const chunks: Array<string> = []
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(
      String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any),
    )
  }
  return btoa(chunks.join(''))
}

export function fromBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const textDecoder = /* @__PURE__ */ new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
})

/** `'t' + utf8` for a valid UTF-8 chunk, otherwise `'b' + base64`. */
export function encodeText(value: Uint8Array) {
  try {
    return 't' + textDecoder.decode(value)
  } catch {
    return 'b' + toBase64(value)
  }
}

const textEncoder = /* @__PURE__ */ new TextEncoder()

export function decodeText(value: string) {
  const data = value.slice(1)
  return value[0] === 't' ? textEncoder.encode(data) : fromBase64(data)
}

interface EncodedSink {
  next: (value: string) => unknown
  return: (value: undefined) => unknown
  throw: (error: unknown) => unknown
}

/**
 * Pump a byte stream into `sink`, one encoded chunk per read. Each sink call
 * is awaited before the next read, so a sink that settles on acceptance
 * applies backpressure to the source. Returns a `stop` function that cancels
 * the reader without signalling the sink; the abort signal and read failures
 * stop the pump and throw through the sink.
 */
function pumpEncoded(
  readable: ReadableStream<Uint8Array>,
  encode: (value: Uint8Array) => string,
  sink: EncodedSink,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()

  const reader = readable.getReader()
  let active = true

  const release = () => {
    active = false
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const stop = (reason?: unknown) => {
    if (!active) {
      return false
    }
    void reader.cancel(reason).catch(() => {})
    release()
    return true
  }
  const fail = (error: unknown) => {
    if (stop(error)) {
      sink.throw(error)
    }
  }
  const abort = () => fail(signal!.reason)

  signal?.addEventListener('abort', abort)
  ;(async () => {
    try {
      while (active) {
        const { done, value } = await reader.read()
        if (!active) {
          return
        }
        if (done) {
          release()
          await sink.return(undefined)
          return
        }
        await sink.next(encode(value))
      }
    } catch (error) {
      fail(error)
    }
  })()

  return stop
}

/**
 * Pump a byte stream into a replay Seroval stream for the async JSON
 * serializers, which collect every chunk before they produce output.
 */
export function pumpEncodedStream(
  readable: ReadableStream<Uint8Array>,
  encode: (value: Uint8Array) => string,
  signal?: AbortSignal,
) {
  const stream = createStream<string | undefined>()
  return [stream, pumpEncoded(readable, encode, stream, signal)] as const
}

/**
 * Pump a byte stream into a live Seroval stream for the streaming
 * serializers. The next chunk is read only after the record for the previous
 * one was accepted, so peak memory scales with one chunk instead of the whole
 * stream. Disposing the serialization cancels the live stream, which stops the
 * pump and forwards the dispose reason to the source.
 */
export function pumpEncodedLiveStream(
  readable: ReadableStream<Uint8Array>,
  encode: (value: Uint8Array) => string,
) {
  const { stream, producer } = createLiveStream<string | undefined>({
    onCancel: (reason) => stop(reason),
  })
  const stop = pumpEncoded(readable, encode, {
    next: (value) => producer.write(value),
    return: (value) => producer.close(value),
    // A cancelled live stream rejects the throw; nothing is left to notify.
    throw: (error) => producer.fail(error).catch(() => {}),
  })
  return [stream, stop] as const
}

/** Rebuild a byte stream from encoded Seroval stream chunks. */
export function fromEncodedStream(
  source: ReturnType<typeof createStream<string | undefined>>,
  decode: (value: string) => Uint8Array,
) {
  // Dropping the disposer after a terminal event lets Seroval's buffer be
  // collected while application code still holds the finished stream.
  let unsubscribe: (() => void) | undefined
  let done = false

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const dispose = source.on({
        next(value) {
          if (done) {
            return
          }
          try {
            controller.enqueue(decode(value!))
          } catch (error) {
            // A malformed chunk fails this stream and abandons the source.
            done = true
            const stop = unsubscribe
            unsubscribe = undefined
            stop?.()
            controller.error(error)
          }
        },
        throw(error) {
          if (!done) {
            done = true
            unsubscribe = undefined
            controller.error(error)
          }
        },
        return() {
          if (!done) {
            done = true
            unsubscribe = undefined
            controller.close()
          }
        },
      })
      if (done) {
        dispose()
      } else {
        unsubscribe = dispose
      }
    },
    cancel() {
      const dispose = unsubscribe
      unsubscribe = undefined
      dispose?.()
    },
  })
}
