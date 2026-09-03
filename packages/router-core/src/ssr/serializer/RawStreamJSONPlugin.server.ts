import { createRawStreamJSONDeserializePlugin } from './createRawStreamJSONDeserializePlugin'

const BufferCtor: any = (globalThis as any).Buffer
const hasNodeBuffer = !!BufferCtor && typeof BufferCtor.from === 'function'

const fromBase64 = (base64: string) => {
  if (hasNodeBuffer) {
    const buffer = BufferCtor.from(base64, 'base64')
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Server-only RawStream plugin for JSON request deserialization. */
export const RawStreamJSONPlugin =
  /* @__PURE__ */ createRawStreamJSONDeserializePlugin(fromBase64)
