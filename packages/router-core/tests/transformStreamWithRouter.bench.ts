import { ReadableStream } from 'node:stream/web'
import { bench, describe } from 'vitest'
import { transformStreamWithRouter } from '../src/ssr/transformStreamWithRouter'

/**
 * Full-transform benchmarks for transformStreamWithRouter (main path).
 *
 * Measures end-to-end throughput of the SSR stream transformer:
 * - "passthrough": large HTML body streamed through the scanner with no
 *   router injections (worst case for per-chunk decode/encode overhead).
 * - "injections": small body with frequent router HTML injections at
 *   closing-tag boundaries.
 *
 * Both scenarios deliberately force the MAIN path (reserveStreamFastPath =>
 * false) so the scanner pipeline is what's being measured.
 */

function makeFakeServerSsr() {
  let cleanedUp = false
  return {
    isSerializationFinished: () => true,
    reserveStreamFastPath: () => false,
    onInjectedHtml: () => () => {},
    onSerializationFinished: () => () => {},
    takeBufferedHtml: (): string | undefined => undefined,
    setRenderFinished: () => {},
    cleanup: () => {
      cleanedUp = true
    },
    liftScriptBarrier: () => {},
    isCleanedUp: () => cleanedUp,
  }
}

function makeBenchUpstream(chunks: Array<Uint8Array>): ReadableStream {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) {
        c.enqueue(chunks[i++]!)
      } else {
        c.close()
      }
    },
  })
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader()
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value!.byteLength
  }
  return bytes
}

// Deterministic realistic-ish HTML body content with plenty of closing tags
// so the scanner hits boundaries frequently.
function generateBodyChunk(size: number, seed: number): string {
  let html = ''
  while (html.length < size) {
    const open = `<div class="item item-${seed % 97}" data-idx="${seed}">`
    const inner = `<span class="label">Label ${seed}</span><p>Some paragraph content for chunk ${seed}.</p>`
    html += `${open}${inner}</div>`
    seed++
  }
  return html.slice(0, size)
}

function makeChunks(
  count: number,
  size: number,
  wrapInDocument: boolean,
): Array<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks: Array<Uint8Array> = []
  if (wrapInDocument) {
    chunks.push(encoder.encode('<html><head><title>t</title></head><body>'))
  }
  for (let i = 0; i < count; i++) {
    chunks.push(encoder.encode(generateBodyChunk(size, i)))
  }
  if (wrapInDocument) {
    chunks.push(encoder.encode('</body></html>'))
  }
  return chunks
}

const LARGE_CHUNKS = makeChunks(256, 8 * 1024, true)
const SMALL_CHUNKS = (() => {
  const encoder = new TextEncoder()
  const chunks: Array<Uint8Array> = []
  chunks.push(encoder.encode('<html><body>'))
  for (let i = 0; i < 50; i++) {
    chunks.push(encoder.encode(`<div>a${i}</div>`))
  }
  chunks.push(encoder.encode('</body></html>'))
  return chunks
})()

describe('transformStreamWithRouter full transform', () => {
  bench('large body passthrough (~2MB, 256x8KB chunks)', async () => {
    const serverSsr = makeFakeServerSsr()
    const router = { serverSsr }
    const out = transformStreamWithRouter(
      router as any,
      makeBenchUpstream(LARGE_CHUNKS),
    )
    await drain(out as any)
  })

  bench('small body with frequent injections', async () => {
    const serverSsr = makeFakeServerSsr()
    // Inject router HTML between app chunks: takeBufferedHtml returns a
    // script for every other drain, exercising the injection splice path.
    let drainCount = 0
    serverSsr.takeBufferedHtml = () => {
      drainCount++
      return drainCount % 2 === 0
        ? `<script>injected(${drainCount})</script>`
        : undefined
    }
    const router = { serverSsr }
    const out = transformStreamWithRouter(
      router as any,
      makeBenchUpstream(SMALL_CHUNKS),
    )
    await drain(out as any)
  })

  bench('fast path passthrough (~2MB, 256x8KB chunks)', async () => {
    const serverSsr = makeFakeServerSsr()
    serverSsr.reserveStreamFastPath = () => true
    const router = { serverSsr }
    const out = transformStreamWithRouter(
      router as any,
      makeBenchUpstream(LARGE_CHUNKS),
    )
    await drain(out as any)
  })
})
