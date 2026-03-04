import { ReadableStream } from 'node:stream/web'
import { bench, describe } from 'vitest'
import { TSR_SCRIPT_BARRIER_ID } from '../src/ssr/constants'
import { transformStreamWithRouter } from '../src/ssr/transformStreamWithRouter'

type RouterMockOptions = {
  serializationFinished?: boolean
  initialBufferedHtml?: string
}

function createRouterMock(options?: RouterMockOptions) {
  const listeners = new Map<string, Set<() => void>>()
  let bufferedHtml = options?.initialBufferedHtml ?? ''
  let serializationFinished = options?.serializationFinished ?? false

  const router = {
    subscribe(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set<() => void>()
      set.add(listener)
      listeners.set(event, set)
      return () => {
        set.delete(listener)
      }
    },
    emit(event: string) {
      listeners.get(event)?.forEach((listener) => listener())
    },
    serverSsr: {
      isSerializationFinished() {
        return serializationFinished
      },
      takeBufferedHtml() {
        if (!bufferedHtml) return undefined
        const html = bufferedHtml
        bufferedHtml = ''
        return html
      },
      injectHtml(html: string) {
        bufferedHtml += html
        router.emit('onInjectedHtml')
      },
      setRenderFinished() {
        serializationFinished = true
        router.emit('onSerializationFinished')
      },
      liftScriptBarrier() {},
      cleanup() {},
    },
  }

  return router as any
}

const encoder = new TextEncoder()

function createChunkedStream(
  chunks: Array<string | Uint8Array>,
  onEnqueue?: (index: number) => void,
) {
  return new ReadableStream<string | Uint8Array>({
    start(controller) {
      for (let i = 0; i < chunks.length; i++) {
        controller.enqueue(chunks[i]!)
        onEnqueue?.(i)
      }
      controller.close()
    },
  })
}

async function consumeStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
  }
  return totalBytes
}

function makeHtmlChunk(size: number) {
  const body = 'x'.repeat(Math.max(0, size - 64))
  return `<div class="row"><span>${body}</span></div>`
}

describe('transformStreamWithRouter bench - fast path', () => {
  const binaryChunks = Array.from({ length: 120 }, () =>
    encoder.encode(makeHtmlChunk(4096)),
  )

  const stringChunks = Array.from({ length: 120 }, () => makeHtmlChunk(4096))

  bench('fast path - uint8 chunks', async () => {
    const router = createRouterMock({ serializationFinished: true })
    const appStream = createChunkedStream(binaryChunks)
    const transformed = transformStreamWithRouter(router, appStream)
    await consumeStream(transformed)
  })

  bench('fast path - string chunks', async () => {
    const router = createRouterMock({ serializationFinished: true })
    const appStream = createChunkedStream(stringChunks)
    const transformed = transformStreamWithRouter(router, appStream)
    await consumeStream(transformed)
  })
})

describe('transformStreamWithRouter bench - streaming path', () => {
  const headChunk = '<html><body><main><div>content</div>'
  const barrierChunk = `<script id="${TSR_SCRIPT_BARRIER_ID}"></script>`
  const tailChunk = '</main></body></html>'

  bench('barrier + initial buffered html', async () => {
    const router = createRouterMock({
      serializationFinished: false,
      initialBufferedHtml: '<script>window.__initial=1</script>',
    })

    const appStream = createChunkedStream([
      encoder.encode(headChunk),
      encoder.encode(barrierChunk),
      encoder.encode(tailChunk),
    ])

    const transformed = transformStreamWithRouter(router, appStream)
    await consumeStream(transformed)
  })

  bench('barrier + incremental injected html', async () => {
    const router = createRouterMock({ serializationFinished: false })

    const appStream = createChunkedStream(
      [
        encoder.encode(headChunk),
        encoder.encode(barrierChunk),
        encoder.encode(makeHtmlChunk(2048)),
        encoder.encode(makeHtmlChunk(2048)),
        encoder.encode(tailChunk),
      ],
      (index) => {
        if (index <= 3) {
          router.serverSsr.injectHtml(
            `<script>window.__bench_chunk_${index}=1</script>`,
          )
        }
      },
    )

    const transformed = transformStreamWithRouter(router, appStream)
    await consumeStream(transformed)
  })
})