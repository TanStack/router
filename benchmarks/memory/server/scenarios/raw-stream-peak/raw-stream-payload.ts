export const rawStreamChunkCount = 128
export const rawStreamChunkBytes = 64 * 1024

export const rawStreamPeakMarker = 'raw-stream-peak'

/** Fills one chunk with bytes that differ per request and per chunk. */
export function fillRawStreamChunk(
  chunk: Uint8Array,
  id: string,
  chunkIndex: number,
) {
  let state = (hashId(id) + Math.imul(chunkIndex + 1, 0x9e37_79b9)) >>> 0

  for (let index = 0; index < chunk.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    chunk[index] = state >>> 24
  }

  return chunk
}

/**
 * One request's stream: `rawStreamChunkCount` fresh chunks of
 * `rawStreamChunkBytes`, produced on demand so the source itself never holds
 * more than the one chunk the consumer has not read yet.
 */
export function createRawStreamSource(id: string) {
  let produced = 0

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced === rawStreamChunkCount) {
        controller.close()
        return
      }

      controller.enqueue(
        fillRawStreamChunk(new Uint8Array(rawStreamChunkBytes), id, produced),
      )
      produced++
    },
  })
}

function hashId(id: string) {
  let hash = 2_166_136_261

  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}
