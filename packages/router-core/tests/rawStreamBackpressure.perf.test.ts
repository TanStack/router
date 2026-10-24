// On-demand memory test for the SSR RawStream pump.
//
// NOT run in CI by default. To execute:
//   RUN_BACKPRESSURE_PERF=1 pnpm --filter @tanstack/router-core test:unit -- rawStreamBackpressure --pool=forks --execArgv=--expose-gc
//
// The SSR plugin feeds a RawStream to Seroval through a live stream, which
// reads the next chunk only after the record for the previous one was
// accepted. A replay stream would keep every encoded chunk for the life of the
// serialization, so a large RawStream retained its whole base64 encoding.
import { describe, expect, it } from 'vitest'
import { crossSerializeStream } from 'seroval'
import { RawStream } from '../src/ssr/serializer/RawStream'
import { RawStreamSSRPlugin } from '../src/ssr/serializer/RawStreamSSRPlugin'

const enabled = process.env.RUN_BACKPRESSURE_PERF === '1'
const requiresGc = typeof (globalThis as any).gc === 'function'

function createChunkedSource(chunkCount: number, chunkBytes: number) {
  let produced = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced === chunkCount) {
        controller.close()
        return
      }
      // Fresh, distinct bytes per chunk so retained encodings cannot share
      // storage.
      const chunk = new Uint8Array(chunkBytes)
      for (let i = 0; i < chunkBytes; i += 64) {
        chunk[i] = produced & 0xff
      }
      produced++
      controller.enqueue(chunk)
    },
  })
}

function retainedBytes() {
  const usage = process.memoryUsage()
  return usage.heapUsed + usage.external
}

describe.runIf(enabled)('RawStream SSR serialization memory', () => {
  it.runIf(requiresGc)(
    'retains one encoded chunk instead of the whole stream',
    async () => {
      const CHUNKS = 256
      const CHUNK_BYTES = 64 * 1024 // 16 MiB of input, ~21 MiB of base64
      const SAMPLE_EVERY = 16
      const gc = (globalThis as any).gc as () => void

      gc()
      const baseline = retainedBytes()
      let peakGrowth = 0
      let records = 0
      let outputCodeUnits = 0

      await new Promise<void>((resolve, reject) => {
        crossSerializeStream(
          new RawStream(createChunkedSource(CHUNKS, CHUNK_BYTES)),
          {
            refs: new Map(),
            plugins: [RawStreamSSRPlugin],
            scopeId: 'raw-stream-memory',
            onSerialize(source) {
              // The hydration output would take this source over; drop it so
              // only what serialization itself retains is measured.
              outputCodeUnits += source.length
              if (++records % SAMPLE_EVERY === 0) {
                gc()
                peakGrowth = Math.max(peakGrowth, retainedBytes() - baseline)
              }
            },
            onError: reject,
            onDone: resolve,
          },
        )
      })

      // The initial record, one record per chunk, and the return record.
      expect(records).toBe(CHUNKS + 2)
      expect(outputCodeUnits).toBeGreaterThan(CHUNKS * CHUNK_BYTES)
      expect(
        peakGrowth,
        `serialization retained ${peakGrowth} bytes at its peak`,
      ).toBeLessThan(4 * 1024 * 1024)
    },
  )
})
