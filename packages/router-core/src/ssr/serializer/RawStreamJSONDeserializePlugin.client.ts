import { createRawStreamJSONDeserializePlugin } from './createRawStreamJSONDeserializePlugin'

const fromBase64 = (value: string) => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Browser-only RawStream plugin for cached JSON responses. */
export const RawStreamJSONDeserializePlugin =
  /* @__PURE__ */ createRawStreamJSONDeserializePlugin(fromBase64)
