/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { renderToStream } from '@remix-run/ui/server'
import { isbot } from 'isbot'
import { transformReadableStreamWithRouter } from '@tanstack/router-core/ssr/server'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { RemixNode } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Streaming SSR for the Remix UI binding. Mirrors
 * `renderRouterToStream` from `@tanstack/solid-router/ssr/server`:
 *
 * 1. Renders the children tree through `@remix-run/ui/server`'s
 *    `renderToStream` (the streaming primitive — frames, fallbacks,
 *    out-of-order resolution).
 * 2. Pipes the byte stream through `transformReadableStreamWithRouter`
 *    from router-core, which holds back `</body>` until the seroval
 *    dehydration payload is ready and splices the script in front of
 *    it.
 * 3. Returns a Response — Start's `createStartHandler` is the caller
 *    and handles cleanup, status codes, and any redirect short-circuit.
 *
 * Bot user-agents (search crawlers, social previews, etc.) are
 * detected via `isbot` and served the fully-rendered HTML — we drain
 * the whole stream before responding so they never see partial
 * content. Real browsers stream as content is produced.
 *
 * Render-time errors are caught early: if `onError` fires before the
 * stream has produced any bytes (component throws synchronously
 * during the first render pass), we swap to a 500 fallback. Errors
 * after the first byte propagate as a stream error — the client sees
 * the partial HTML it has so far, which is the same recovery
 * behaviour as React's streaming SSR.
 */
export const renderRouterToStream = async ({
  request,
  router,
  responseHeaders,
  children,
}: {
  request: Request
  router: AnyRouter
  responseHeaders: Headers
  children: () => RemixNode
}): Promise<Response> => {
  // The router's server-SSR machinery accumulates pending dehydration
  // payloads, deferred-promise registrations, and stream-script
  // emitters. It must be torn down once the response is fully drained
  // (or short-circuited by an early error) — otherwise long-running
  // server processes leak per-request state.
  //
  // NOTE on layered ownership: `transformReadableStreamWithRouter`
  // (router-core) ALSO calls `router.serverSsr?.cleanup()` once it
  // finishes splicing the dehydration script. So the cleanup we
  // schedule here is **defensive overlap** — it covers the
  // early-error path (where we never reach the transformer) and the
  // bot-drain/browser-stream paths where we want a guaranteed
  // teardown even if a future router-core change drops its own
  // call. `cleanupOnce` plus `serverSsr.cleanup`'s own idempotency
  // (`if (!router.serverSsr) return` after first call) make double
  // calls safe.
  let cleanedUp = false
  const cleanupOnce = () => {
    if (cleanedUp) return
    cleanedUp = true
    try {
      router.serverSsr?.cleanup()
    } catch (error) {
      console.error('[remix-router/ssr] cleanup error:', error)
    }
  }

  const docTypeBytes = new TextEncoder().encode('<!DOCTYPE html>')
  const tree = children()

  let earlyError: unknown
  let firstByteEmitted = false

  const htmlStream = renderToStream(tree as any, {
    onError(error) {
      if (!firstByteEmitted && earlyError === undefined) {
        earlyError = error
      }
      console.error('[remix-router/ssr] render error:', error)
    },
  })

  // Drain the first read to detect early errors and to prepend the
  // doctype. After the first chunk arrives, switch to streaming mode.
  const reader = htmlStream.getReader()
  let firstChunk: Uint8Array | undefined
  try {
    const r = await reader.read()
    if (!r.done) firstChunk = r.value
  } catch (error) {
    earlyError = earlyError ?? error
  }

  if (earlyError !== undefined) {
    try {
      reader.releaseLock()
    } catch {
      // ignore
    }
    cleanupOnce()
    return errorResponse(earlyError)
  }

  // From here on, we're committed to streaming.
  const isBot = isbot(request.headers.get('User-Agent'))

  const prefixed = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(docTypeBytes)
      if (firstChunk) {
        controller.enqueue(firstChunk)
        firstByteEmitted = true
      }
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          // `value` is guaranteed non-null when `done` is false per the
          // ReadableStream contract; enqueue unconditionally.
          controller.enqueue(value)
          firstByteEmitted = true
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        try {
          reader.releaseLock()
        } catch {
          // ignore
        }
        // For the streaming-to-browser path, this `finally` runs once
        // the underlying renderer stream is fully consumed (the
        // for-loop hits `done`) or throws. Run cleanup here so
        // resources are released after a normal end-of-stream.
        cleanupOnce()
      }
    },
    cancel() {
      // `cancel()` only fires if the *consumer* of `prefixed`
      // explicitly cancels it (calls `prefixed.cancel()` or
      // `reader.cancel()`). Today, `transformReadableStreamWithRouter`
      // pulls from `prefixed` via a reader and only ever
      // `releaseLock()`s — it does not cancel the upstream. So in
      // the typical client-disconnect flow this callback does NOT
      // fire, and cleanup happens via the `finally` above once the
      // renderer stream exhausts itself naturally.
      //
      // We still wire up `cancel()` so that any future change to the
      // transformer (or a custom consumer of `prefixed`) that DOES
      // propagate cancellation gets prompt teardown.
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
      cleanupOnce()
    },
  })

  const transformed = transformReadableStreamWithRouter(
    router,
    prefixed as unknown as NodeReadableStream,
  ) as unknown as ReadableStream<Uint8Array>

  // Bot path: drain into a buffer so the crawler always gets a
  // complete document. Costs latency but matches React's `allReady`
  // wait for indexability.
  if (isBot) {
    const chunks: Array<Uint8Array> = []
    const r = transformed.getReader()
    try {
      for (;;) {
        const { done, value } = await r.read()
        if (done) break
        chunks.push(value)
      }
    } finally {
      try {
        r.releaseLock()
      } catch {
        // ignore
      }
      // The bot path waits for the full stream before responding, so
      // by the time we reach this finally block the prefixed stream's
      // own finally has typically already run and called cleanup. The
      // `cleanupOnce` guard makes the redundant call safe; we keep it
      // here to cover the throw-during-drain edge case where the
      // upstream finally might not run before this one.
      cleanupOnce()
    }
    let total = 0
    for (const c of chunks) total += c.byteLength
    const body = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      body.set(c, offset)
      offset += c.byteLength
    }
    return new Response(body as any, {
      status: router.stores.statusCode.get(),
      headers: ensureHtmlContentType(responseHeaders),
    })
  }

  return new Response(transformed as any, {
    status: router.stores.statusCode.get(),
    headers: ensureHtmlContentType(responseHeaders),
  })
}

/**
 * Streaming SSR responses must declare `content-type: text/html` so
 * browsers parse them as HTML. The Start handler typically sets this,
 * but fall through here defensively — sending a stream without
 * `content-type` makes browsers download instead of render.
 */
function ensureHtmlContentType(headers: Headers): Headers {
  if (headers.has('content-type')) return headers
  const next = new Headers(headers)
  next.set('content-type', 'text/html; charset=utf-8')
  return next
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error)
  const isDev = process.env.NODE_ENV !== 'production'
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>` +
    `<title>500 — server render error</title></head>` +
    `<body><h1>500 — Server render error</h1>${
      isDev
        ? `<pre>${escapeHtml(message)}</pre>`
        : '<p>The server encountered an unexpected error while rendering this page.</p>'
    }</body></html>`
  return new Response(html, {
    status: 500,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
