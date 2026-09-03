import { createPlugin } from 'seroval'
import type { RawStreamRPCNode } from './RawStream'

/** Client-side RawStream plugin for multiplexed server-function responses. */
/* @__NO_SIDE_EFFECTS__ */
export function createRawStreamDeserializePlugin(
  getStream: (id: number) => ReadableStream<Uint8Array>,
) {
  return /* @__PURE__ */ createPlugin<
    ReadableStream<Uint8Array>,
    RawStreamRPCNode
  >({
    tag: 'tss/RawStream',
    test: () => false,
    parse: {},
    serialize: undefined as never,
    deserialize(node, ctx) {
      return getStream(ctx.deserialize<number>(node.streamId))
    },
  })
}
