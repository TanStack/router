// @ts-nocheck
import { ReadableStream } from 'node:stream/web'
import { transformStreamWithRouter } from '../dist/esm/ssr/transformStreamWithRouter.js'
import { TSR_SCRIPT_BARRIER_ID } from '../dist/esm/ssr/constants.js'

function createRouterMock(options = {}) {
  const listeners = new Map()
  let bufferedHtml = options.initialBufferedHtml ?? ''
  let serializationFinished = options.serializationFinished ?? false

  const router = {
    subscribe(event, listener) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return () => {
        set.delete(listener)
      }
    },
    emit(event) {
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
      injectHtml(html) {
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

  return router
}

const encoder = new TextEncoder()

function createChunkedStream(chunks, onEnqueue) {
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < chunks.length; i++) {
        controller.enqueue(chunks[i])
        onEnqueue?.(i)
      }
      controller.close()
    },
  })
}

async function consumeStream(stream) {
  const reader = stream.getReader()
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
  }
  return totalBytes
}

function makeHtmlChunk(size) {
  const body = 'x'.repeat(Math.max(0, size - 64))
  return `<div class="row"><span>${body}</span></div>`
}

async function runFastPathWorkload(iterations = 500) {
  const binaryChunks = Array.from({ length: 120 }, () =>
    encoder.encode(makeHtmlChunk(4096)),
  )

  let total = 0
  for (let i = 0; i < iterations; i++) {
    const router = createRouterMock({ serializationFinished: true })
    const appStream = createChunkedStream(binaryChunks)
    const transformed = transformStreamWithRouter(router, appStream)
    total += await consumeStream(transformed)
  }

  return total
}

async function runStreamingWorkload(iterations = 300) {
  const headChunk = '<html><body><main><div>content</div>'
  const barrierChunk = `<script id="${TSR_SCRIPT_BARRIER_ID}"></script>`
  const tailChunk = '</main></body></html>'

  let total = 0
  for (let i = 0; i < iterations; i++) {
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
            `<script>window.__profile_chunk_${index}=1</script>`,
          )
        }
      },
    )

    const transformed = transformStreamWithRouter(router, appStream)
    total += await consumeStream(transformed)
  }

  return total
}

async function main() {
  const fast = await runFastPathWorkload()
  const streaming = await runStreamingWorkload()
  process.stdout.write(
    JSON.stringify(
      {
        mode: 'transformStreamWithRouter.profile',
        fast,
        streaming,
        total: fast + streaming,
      },
      null,
      2,
    ) + '\n',
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
