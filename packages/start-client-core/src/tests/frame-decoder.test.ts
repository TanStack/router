import { describe, expect, it } from 'vitest'
import { createFrameDecoder } from '../client-rpc/frame-decoder'
import { FRAME_HEADER_SIZE, FrameType } from '../constants'
import fc from 'fast-check'

/**
 * Client-side frame decoder: the binary framing protocol is parsed from raw
 * HTTP response bytes (network = attacker-influenced). These tests pin the
 * robustness contract: correct round-trips, chunk-boundary independence, and
 * graceful failure on malformed/hostile input.
 */

function encodeFrame(
  type: number,
  streamId: number,
  payload: Uint8Array,
): Uint8Array {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
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

function jsonFrame(json: string): Uint8Array {
  return encodeFrame(FrameType.JSON, 0, new TextEncoder().encode(json))
}

function streamFromChunks(chunks: Array<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

async function readAllJson(decoder: ReturnType<typeof createFrameDecoder>) {
  const reader = decoder.chunks.getReader()
  const lines: Array<string> = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    lines.push(value!)
  }
  return lines
}

describe('frame decoder', () => {
  it('round-trips JSON frames and binary chunks exactly', async () => {
    const payload = new Uint8Array([0, 255, 1, 254, 128, 127])
    const bytes = [
      jsonFrame('{"step":1}'),
      encodeFrame(FrameType.CHUNK, 7, payload),
      encodeFrame(FrameType.END, 7, new Uint8Array(0)),
      jsonFrame('{"step":2}'),
    ]

    const decoder = createFrameDecoder(streamFromChunks(bytes))
    expect(await readAllJson(decoder)).toEqual(['{"step":1}', '{"step":2}'])

    const stream = decoder.getStream(7)
    const reader = stream.getReader()
    expect((await reader.read()).value).toEqual(payload)
    expect((await reader.read()).done).toBe(true)
  })

  it('produces identical output regardless of network chunk boundaries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.string(), fc.uint8Array({ maxLength: 64 })), {
          maxLength: 12,
        }),
        fc.integer({ min: 1, max: 5 }),
        async (frames, splitSize) => {
          let all = new Uint8Array(0)
          for (const [json] of frames) {
            all = Uint8Array.from([...all, ...jsonFrame(json)])
          }
          // feed bytes in fixed-size splits smaller than the frames
          const chunks: Array<Uint8Array> = []
          for (let i = 0; i < all.length; i += splitSize) {
            chunks.push(all.subarray(i, i + splitSize))
          }
          const decoder = createFrameDecoder(streamFromChunks(chunks))
          expect(await readAllJson(decoder)).toEqual(frames.map(([j]) => j))
        },
      ),
    )
  })

  it('rejects unknown frame types instead of misinterpreting them', async () => {
    const bytes = [encodeFrame(99, 1, new Uint8Array([1]))]
    const decoder = createFrameDecoder(streamFromChunks(bytes))
    await expect(readAllJson(decoder)).rejects.toThrow(/Unknown frame type/)
  })

  it('enforces streamId conventions', async () => {
    const badJson = encodeFrame(FrameType.JSON, 5, new TextEncoder().encode('{}'))
    const decoder = createFrameDecoder(streamFromChunks([badJson]))
    await expect(readAllJson(decoder)).rejects.toThrow(/streamId/)

    const badChunk = encodeFrame(FrameType.CHUNK, 0, new Uint8Array([1]))
    const decoder2 = createFrameDecoder(streamFromChunks([badChunk]))
    await expect(readAllJson(decoder2)).rejects.toThrow(/streamId/)
  })

  it('fails fast on absurd length headers without allocating them', async () => {
    // length header = 0xFFFFFFFF (~4GB); must be rejected by the size cap
    const hostile = new Uint8Array(FRAME_HEADER_SIZE)
    hostile[0] = FrameType.CHUNK
    hostile[1] = 0
    hostile[2] = 0
    hostile[3] = 0
    hostile[4] = 1
    hostile[5] = 0xff
    hostile[6] = 0xff
    hostile[7] = 0xff
    hostile[8] = 0xff

    const decoder = createFrameDecoder(streamFromChunks([hostile]))
    await expect(readAllJson(decoder)).rejects.toThrow(/payload too large/i)
  })

  it('ignores a trailing truncated frame when the stream ends', async () => {
    // a partial header/payload at end-of-stream must not hang or throw
    const complete = jsonFrame('{"ok":true}')
    const truncated = encodeFrame(FrameType.CHUNK, 3, new Uint8Array([9, 9])).subarray(0, 11)

    const decoder = createFrameDecoder(
      streamFromChunks([
        Uint8Array.from([...complete, ...truncated]),
      ]),
    )
    expect(await readAllJson(decoder)).toEqual(['{"ok":true}'])
  })
})
