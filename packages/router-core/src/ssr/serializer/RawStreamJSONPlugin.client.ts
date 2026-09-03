import { createPlugin, createStream } from 'seroval'
import { RawStream } from './RawStream'
import type { RawStreamJSONNode } from './RawStream'

const toBase64 = (bytes: Uint8Array) => {
  const chunks: Array<string> = []
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(
      String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as any),
    )
  }
  return btoa(chunks.join(''))
}

const textDecoder = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
})

const encodeText = (value: Uint8Array) => {
  try {
    return 't' + textDecoder.decode(value)
  } catch {
    return 'b' + toBase64(value)
  }
}

function encodeStream(
  readable: ReadableStream<Uint8Array>,
  encode: (value: Uint8Array) => string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()

  const stream = createStream()
  const reader = readable.getReader()
  let active = true

  const release = () => {
    active = false
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const fail = (reason: unknown) => {
    if (!active) {
      return
    }
    void reader.cancel(reason).catch(() => {})
    release()
    stream.throw(reason)
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
          stream.return(undefined)
          return
        }
        stream.next(encode(value))
      }
    } catch (error) {
      fail(error)
    }
  })()

  return stream
}

/** RawStream plugin for JSON requests and browser-readable static cache data. */
/* @__NO_SIDE_EFFECTS__ */
export function createRawStreamJSONPlugin(signal?: AbortSignal) {
  return /* @__PURE__ */ createPlugin<RawStream, RawStreamJSONNode>({
    tag: 'tss/RawStream',
    test: (value) => value instanceof RawStream,
    parse: {
      async: async (value, ctx) => ({
        text: await ctx.parse(value.hint === 'text'),
        stream: await ctx.parse(
          encodeStream(
            value.stream,
            value.hint === 'text' ? encodeText : toBase64,
            signal,
          ),
        ),
      }),
    },
    serialize: undefined as never,
    deserialize: undefined as never,
  })
}

export const RawStreamJSONPlugin = /* @__PURE__ */ createRawStreamJSONPlugin()
