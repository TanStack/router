import { createPlugin } from 'seroval'
import type { RawStreamJSONNode } from './RawStream'
import type { createStream } from 'seroval'

export function createRawStreamJSONDeserializePlugin(
  fromBase64: (value: string) => Uint8Array,
) {
  function fromEncodedStream(
    stream: ReturnType<typeof createStream>,
    decode: (value: string) => Uint8Array,
  ) {
    let source: ReturnType<typeof createStream> | undefined = stream
    let unsubscribe: (() => void) | undefined

    return new ReadableStream<Uint8Array>({
      start(controller) {
        const nextUnsubscribe = source!.on({
          next(value: string) {
            controller.enqueue(decode(value))
          },
          throw(error: unknown) {
            source = unsubscribe = undefined
            controller.error(error)
          },
          return() {
            source = unsubscribe = undefined
            controller.close()
          },
        })
        if (source) {
          unsubscribe = nextUnsubscribe
        }
      },
      cancel() {
        const dispose = unsubscribe
        source = unsubscribe = undefined
        dispose?.()
      },
    })
  }

  const textEncoder = new TextEncoder()
  const decodeText = (value: string) => {
    const data = value.slice(1)
    return value[0] === 't' ? textEncoder.encode(data) : fromBase64(data)
  }
  return /* @__PURE__ */ createPlugin<
    ReadableStream<Uint8Array>,
    RawStreamJSONNode
  >({
    tag: 'tss/RawStream',
    test: () => false,
    parse: {},
    serialize: undefined as never,
    deserialize(node, ctx) {
      const decode = ctx.deserialize<boolean>(node.text)
        ? decodeText
        : fromBase64
      return fromEncodedStream(
        ctx.deserialize<ReturnType<typeof createStream>>(node.stream),
        decode,
      )
    },
  })
}
