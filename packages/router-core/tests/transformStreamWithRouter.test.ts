import { ReadableStream } from 'node:stream/web'
import { describe, expect, it, vi } from 'vitest'
import { transformStreamWithRouter } from '../src/ssr/transformStreamWithRouter'

function createRouterMock(options?: {
  serializationFinished?: boolean
  initialBufferedHtml?: string
}) {
  const listeners = new Map<string, Set<() => void>>()
  let bufferedHtml = options?.initialBufferedHtml ?? ''
  let serializationFinished = options?.serializationFinished ?? false
  let cleanedUp = false
  let setRenderFinishedCalls = 0

  const router = {
    subscribe(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set<() => void>()
      set.add(listener)
      listeners.set(event, set)
      return () => {
        set.delete(listener)
      }
    },
    emit({ type }: { type: string }) {
      listeners.get(type)?.forEach((listener) => listener())
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
        router.emit({ type: 'onInjectedHtml' })
      },
      setRenderFinished() {
        setRenderFinishedCalls++
        serializationFinished = true
        router.emit({ type: 'onSerializationFinished' })
      },
      liftScriptBarrier() {},
      cleanup() {
        cleanedUp = true
      },
    },
  }

  return {
    router: router as any,
    wasCleanedUp() {
      return cleanedUp
    },
    getSetRenderFinishedCalls() {
      return setRenderFinishedCalls
    },
  }
}

async function readAll(stream: ReadableStream<Uint8Array | string>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (typeof value === 'string') {
      result += value
    } else {
      result += decoder.decode(value, { stream: true })
    }
  }
  result += decoder.decode()
  return result
}

describe('transformStreamWithRouter', () => {
  it('propagates cancel to underlying source in fast path', async () => {
    const { router, wasCleanedUp } = createRouterMock({
      serializationFinished: true,
    })
    const encoder = new TextEncoder()
    let canceled = false

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<html><body>hello</body></html>'))
      },
      cancel() {
        canceled = true
      },
    })

    const transformed = transformStreamWithRouter(router, appStream)
    const reader = transformed.getReader()

    await reader.read()
    await reader.cancel('test cancel')
    await Promise.resolve()

    expect(canceled).toBe(true)
    expect(wasCleanedUp()).toBe(true)
  })

  it('inserts router html before closing tags when </body> and </html> are split across chunks', async () => {
    const { router } = createRouterMock({
      serializationFinished: false,
    })
    const encoder = new TextEncoder()

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '<html><body><div>content</div><script id="$tsr-stream-barrier"></script></body>',
          ),
        )
        router.serverSsr.injectHtml('<script>window.__injected=1</script>')
        controller.enqueue(encoder.encode('</html>'))
        controller.close()
      },
    })

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    const injectedIndex = html.indexOf('<script>window.__injected=1</script>')
    const bodyEndIndex = html.indexOf('</body>')
    const htmlEndIndex = html.indexOf('</html>')

    expect(injectedIndex, html).toBeGreaterThan(-1)
    expect(bodyEndIndex, html).toBeGreaterThan(-1)
    expect(htmlEndIndex, html).toBeGreaterThan(-1)
    expect(injectedIndex).toBeLessThan(htmlEndIndex)
    expect(injectedIndex).toBeGreaterThanOrEqual(0)
  })

  it('propagates cancel to underlying source in normal path', async () => {
    const { router, wasCleanedUp } = createRouterMock({
      serializationFinished: false,
    })
    let canceled = false

    const appStream = new ReadableStream<Uint8Array>({
      pull() {
        // Keep stream open
      },
      cancel() {
        canceled = true
      },
    })

    const transformed = transformStreamWithRouter(router, appStream)
    const reader = transformed.getReader()

    await reader.cancel('normal-path-cancel')
    await Promise.resolve()

    expect(canceled).toBe(true)
    expect(wasCleanedUp()).toBe(true)
  })

  it('encodes string chunks in fast path', async () => {
    const { router } = createRouterMock({
      serializationFinished: true,
    })

    const appStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('<html><body>hello-string</body></html>')
        controller.close()
      },
    })

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    expect(html).toContain('hello-string')
    expect(html).toContain('</body>')
  })

  it('calls setRenderFinished in fast path when app stream completes', async () => {
    const { router, getSetRenderFinishedCalls } = createRouterMock({
      serializationFinished: true,
    })
    const encoder = new TextEncoder()

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<html><body>done</body></html>'))
        controller.close()
      },
    })

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    expect(html).toContain('done')
    expect(getSetRenderFinishedCalls()).toBe(1)
  })

  it('flushes pendingRouterHtml when barrier and </body> land in the same chunk', async () => {
    // when the barrier script and </body> appear in the same chunk,
    // scripts buffered in pendingRouterHtml (e.g. from initialBufferedHtml) must be
    // emitted immediately — not deferred to tryFinish(). They must appear between
    // the barrier content and </body>, not after </body>.
    const { router } = createRouterMock({
      serializationFinished: false,
      initialBufferedHtml: '<script>window.__initial_buffered__=1</script>',
    })
    const encoder = new TextEncoder()

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Barrier and </body> are in the SAME chunk
        controller.enqueue(
          encoder.encode(
            '<html><body><div>content</div>' +
              '<script id="$tsr-stream-barrier"></script>' +
              '</body></html>',
          ),
        )
        controller.close()
      },
    })

    router.serverSsr.setRenderFinished()

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    const initialScriptIndex = html.indexOf(
      '<script>window.__initial_buffered__=1</script>',
    )
    const bodyEndIndex = html.indexOf('</body>')

    expect(initialScriptIndex, html).toBeGreaterThan(-1)
    expect(bodyEndIndex, html).toBeGreaterThan(-1)
    // Scripts must appear BEFORE </body>
    expect(initialScriptIndex).toBeLessThan(bodyEndIndex)
  })

  it('flushes pendingRouterHtml when barrier has no </body> in same chunk', async () => {
    // when the barrier is found but </body> is in a later chunk,
    // scripts buffered before the barrier should be flushed immediately after
    // emitting the barrier chunk rather than waiting for tryFinish().
    const { router } = createRouterMock({
      serializationFinished: false,
      initialBufferedHtml: '<script>window.__pre_barrier__=1</script>',
    })
    const encoder = new TextEncoder()

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Barrier chunk — no </body> yet
        controller.enqueue(
          encoder.encode(
            '<html><body><div>content</div>' +
              '<script id="$tsr-stream-barrier"></script>',
          ),
        )
        // </body> arrives in a later chunk
        controller.enqueue(encoder.encode('</body></html>'))
        controller.close()
      },
    })

    router.serverSsr.setRenderFinished()

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    const preBarrierScriptIndex = html.indexOf(
      '<script>window.__pre_barrier__=1</script>',
    )
    const bodyEndIndex = html.indexOf('</body>')

    expect(preBarrierScriptIndex, html).toBeGreaterThan(-1)
    expect(bodyEndIndex, html).toBeGreaterThan(-1)
    // Scripts must appear BEFORE </body>
    expect(preBarrierScriptIndex).toBeLessThan(bodyEndIndex)
  })

  it('does not inject pendingRouterHtml into an open split barrier tag', async () => {
    const { router } = createRouterMock({
      serializationFinished: false,
      initialBufferedHtml: '<script>window.__split_barrier__=1</script>',
    })
    const encoder = new TextEncoder()

    const appStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '<html><body><div>content</div><script id="$tsr-stream-barrier"',
          ),
        )
        controller.enqueue(encoder.encode('></script></body></html>'))
        controller.close()
      },
    })

    router.serverSsr.setRenderFinished()

    const transformed = transformStreamWithRouter(router, appStream)
    const html = await readAll(transformed)

    const barrierMarkerIndex = html.indexOf('$tsr-stream-barrier')
    const barrierTagCloseIndex = html.indexOf('>', barrierMarkerIndex)
    const splitBarrierScriptIndex = html.indexOf(
      '<script>window.__split_barrier__=1</script>',
    )
    const bodyEndIndex = html.indexOf('</body>')

    expect(barrierMarkerIndex, html).toBeGreaterThan(-1)
    expect(barrierTagCloseIndex, html).toBeGreaterThan(-1)
    expect(splitBarrierScriptIndex, html).toBeGreaterThan(-1)
    expect(bodyEndIndex, html).toBeGreaterThan(-1)

    expect(splitBarrierScriptIndex).toBeGreaterThan(barrierTagCloseIndex)
    expect(splitBarrierScriptIndex).toBeLessThan(bodyEndIndex)
  })

  it('cancels underlying source on lifetime timeout cleanup', async () => {
    vi.useFakeTimers()

    const { router } = createRouterMock({
      serializationFinished: false,
    })

    let canceled = false

    const appStream = new ReadableStream<Uint8Array>({
      pull() {
        // Keep open forever to force lifetime timeout path
      },
      cancel() {
        canceled = true
      },
    })

    const transformed = transformStreamWithRouter(router, appStream, {
      lifetimeMs: 10,
    })

    try {
      const reader = transformed.getReader()
      const readExpectation = expect(reader.read()).rejects.toThrow(
        'Stream lifetime exceeded',
      )

      await vi.advanceTimersByTimeAsync(11)

      await readExpectation
      expect(canceled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
