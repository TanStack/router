import { createPlugin, createStream } from 'seroval'
import { RawStream } from './RawStream'
import type { PluginInfo, SerovalNode } from 'seroval'

const BufferCtor: any = (globalThis as any).Buffer
const hasNodeBuffer = !!BufferCtor && typeof BufferCtor.from === 'function'

const toBase64 = (bytes: Uint8Array) => {
  if (bytes.length === 0) {
    return ''
  }
  if (hasNodeBuffer) {
    return BufferCtor.from(bytes).toString('base64')
  }

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

const BINARY_FACTORY = () => {}
const TEXT_FACTORY = () => {}
type RawStreamFactory = typeof BINARY_FACTORY

const getFactory = (hint: RawStream['hint']): RawStreamFactory =>
  hint === 'text' ? TEXT_FACTORY : BINARY_FACTORY

// These factories are injected into HTML and must be self-contained. Clearing
// both captured values on terminal events releases Seroval's encoded buffer.
const FACTORY_BINARY = `((s,u=1)=>new ReadableStream({start(c,f){f=s.on({next(b){const d=atob(b),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)},throw(e){s=u=0;c.error(e)},return(){s=u=0;c.close()}});u=u&&f},cancel(){u&&u()}}))`

const FACTORY_TEXT = `((s,u=1,e=new TextEncoder)=>new ReadableStream({start(c,f){f=s.on({next(v){const x=v.slice(1);if(v[0]==='t')c.enqueue(e.encode(x));else{const d=atob(x),a=new Uint8Array(d.length);for(let i=0;i<d.length;i++)a[i]=d.charCodeAt(i);c.enqueue(a)}},throw(x){s=u=0;c.error(x)},return(){s=u=0;c.close()}});u=u&&f},cancel(){u&&u()}}))`

function toEncodedStream<T>(
  readable: ReadableStream<Uint8Array>,
  encodeChunk: (value: Uint8Array) => T,
) {
  const stream = createStream()
  const reader = readable.getReader()
  let active = true

  const cleanup = () => {
    if (!active) {
      return
    }
    active = false
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }

  ;(async () => {
    try {
      while (active) {
        const { done, value } = await reader.read()
        if (!active) {
          return
        }
        if (done) {
          active = false
          reader.releaseLock()
          stream.return(undefined)
          return
        }
        stream.next(encodeChunk(value))
      }
    } catch (error) {
      if (active) {
        cleanup()
        stream.throw(error)
      }
    }
  })()

  return [stream, cleanup] as const
}

function encodeRawStream(value: RawStream) {
  return toEncodedStream(
    value.stream,
    value.hint === 'text' ? encodeText : toBase64,
  )
}

const RawStreamFactoryBinaryPlugin = /* @__PURE__ */ createPlugin<
  RawStreamFactory,
  PluginInfo
>({
  tag: 'tss/RawStreamFactory',
  test(value) {
    return value === BINARY_FACTORY
  },
  parse: {
    stream() {
      return {}
    },
  },
  serialize() {
    return FACTORY_BINARY
  },
  deserialize: undefined as never,
})

const RawStreamFactoryTextPlugin = /* @__PURE__ */ createPlugin<
  RawStreamFactory,
  PluginInfo
>({
  tag: 'tss/RawStreamFactoryText',
  test(value) {
    return value === TEXT_FACTORY
  },
  parse: {
    stream() {
      return {}
    },
  },
  serialize() {
    return FACTORY_TEXT
  },
  deserialize: undefined as never,
})

interface RawStreamSSRNode extends PluginInfo {
  factory: SerovalNode
  stream: SerovalNode
}

/** SSR-only RawStream plugin for streaming JavaScript into HTML. */
export const RawStreamSSRPlugin = /* @__PURE__ */ createPlugin<
  RawStream,
  RawStreamSSRNode
>({
  tag: 'tss/RawStream',
  extends: [RawStreamFactoryBinaryPlugin, RawStreamFactoryTextPlugin],
  test(value: unknown) {
    return value instanceof RawStream
  },
  parse: {
    stream(value, ctx) {
      const factory = ctx.parse(getFactory(value.hint))
      const [stream, cleanup] = encodeRawStream(value)
      ctx.addCleanup(cleanup)
      return {
        factory,
        stream: ctx.parse(stream),
      }
    },
  },
  serialize(node, ctx) {
    return (
      '(' +
      ctx.serialize(node.factory) +
      ')(' +
      ctx.serialize(node.stream) +
      ')'
    )
  },
  deserialize: undefined as never,
})
