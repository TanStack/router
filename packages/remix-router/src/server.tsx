/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createMemoryHistory } from '@tanstack/history'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import { renderToStream } from '@remix-run/ui/server'
import { RouterProvider } from './RouterProvider'
import {
  activateServerComponentCollector,
  createServerComponentCollector,
  deactivateServerComponentCollector,
} from './serverComponent'
import {
  DEFAULT_SERVER_COMPONENT_BASE,
  handleServerComponentRequest,
} from './serverComponentEndpoint'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AnyRouter, Manifest } from '@tanstack/router-core'

interface DocumentProps {
  children?: RemixNode
}

/** Default `<html>` shell for the SSR'd response. Users override via opts.Document. */
function DefaultDocument(handle: Handle<DocumentProps>) {
  return ({ children }: DocumentProps): RemixNode => (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  )
}

/**
 * Context Remix passes when resolving a `<Frame>` during SSR. Mirrors
 * `ResolveFrameContext` from `@remix-run/ui/server` (re-declared so we
 * don't leak a deep import on consumers).
 */
export interface ResolveFrameContext {
  /** Source URL for the frame currently being resolved. */
  currentFrameSrc: string
  /** Source URL for the top-level frame in the current render. */
  topFrameSrc: string
}

/**
 * Server-side `resolveFrame` callback signature. Returns the frame's
 * inner HTML — either as a string or a `ReadableStream<Uint8Array>` so
 * that nested SSR responses (their own `(Request) => Response` outputs)
 * can stream straight through without buffering.
 */
export type ServerResolveFrame = (
  src: string,
  target?: string,
  context?: ResolveFrameContext,
) =>
  | Promise<string | ReadableStream<Uint8Array>>
  | string
  | ReadableStream<Uint8Array>

/**
 * Options for {@link createRouterHandler}.
 */
export interface CreateRouterHandlerOptions {
  /**
   * Factory that returns a fresh `AnyRouter` per request. The handler runs
   * `load()` against the request URL on each call, so the router instance
   * must not be shared across concurrent requests.
   */
  createRouter: () => AnyRouter
  /**
   * Optional asset manifest, normally produced by your bundler. Empty in this
   * spike — assets are emitted directly by the host bundler (e.g. Vite).
   */
  manifest?: Manifest
  /**
   * Wraps the router tree in a document shell. Defaults to a minimal
   * `<html><head/><body/></html>`. Use this to inject `<Theme />` and any
   * `<RMX_*_GLYPHS />` from `@remix-run/ui/theme`.
   *
   * Must be a `remix/ui` factory component:
   * `(handle: Handle<{ children?: RemixNode }>) => RenderFn`.
   */
  Document?: (handle: Handle<DocumentProps>) => (props: DocumentProps) => RemixNode
  /**
   * Resolves `<Frame src="…">` content during SSR. Each rendered frame
   * calls this with its `src` and (optional) `name`; the return value
   * supplies the frame's inner HTML.
   *
   * - Return a `string` to inline a synchronous fragment.
   * - Return a `ReadableStream<Uint8Array>` to splice another
   *   `(Request) => Response` body straight into the parent stream
   *   (recursive SSR). The default does exactly that — it dispatches
   *   `src` back through this same handler so a `<Frame src="/sub">`
   *   renders the `/sub` route inline.
   *
   * Override to route frame sources somewhere else, e.g. an in-process
   * cache, an external service, or a sibling router.
   */
  resolveFrame?: ServerResolveFrame
}

/**
 * Plain Web `Request` → `Response` handler returned by
 * {@link createRouterHandler}. Accepts either a raw `Request` directly
 * or any object with a `.request` property — the latter shape lets the
 * handler drop into Remix 3's `@remix-run/fetch-router` middleware
 * chain (or any other context-shaped middleware) without an adapter.
 *
 * Apps wire it up with whatever HTTP shell their deployment adapter
 * uses (Node `http`, Bun, Cloudflare, Deno, nitro, …).
 */
export type RouterRequestHandler = (
  context: { request: Request; url: URL } | { request: Request } | Request,
) => Promise<Response>

/**
 * Build a `(request: Request) => Promise<Response>` handler that runs
 * a TanStack Router instance per request and SSRs through
 * `renderToStream` from `@remix-run/ui`.
 *
 * The handler is platform-agnostic — wire it up however your
 * deployment adapter prefers. Composing with any of Remix 3's modular
 * packages (`@remix-run/fetch-router`, `@remix-run/session`, etc.) is
 * a matter of layering them around the handler at the app level; the
 * router itself doesn't depend on any of them.
 */
export function createRouterHandler(
  opts: CreateRouterHandlerOptions,
): RouterRequestHandler {
  const Document = opts.Document ?? DefaultDocument

  const handler: RouterRequestHandler = async function handler(context) {
    // Accept either a raw `Request` or a context-shaped wrapper with a
    // `.request` field. The latter is what Remix 3's `fetch-router`
    // and friends pass; we destructure it for free so the same handler
    // can be used both ways without an adapter.
    const request: Request =
      context instanceof Request
        ? context
        : (context as { request: Request }).request
    const url = new URL(request.url)

    const router = opts.createRouter()
    router.update({
      ...router.options,
      history: createMemoryHistory({
        initialEntries: [url.pathname + url.search + url.hash],
      }),
      isServer: true,
    })

    attachRouterServerSsrUtils({
      router,
      manifest: opts.manifest,
    })

    await router.load()

    // Honor router-level redirect short-circuit before kicking off the render.
    // `AnyRedirect` extends `Response`, so we can return it as-is.
    const redirect = router.stores.redirect.get()
    if (redirect) return redirect

    // Kick off dehydration. Seroval streams scripts into router.serverSsr's
    // buffer; we splice them into the response stream at the right spot.
    const dehydratePromise = router.serverSsr!.dehydrate()
    const serializationDone = new Promise<void>((resolve) => {
      router.serverSsr!.onSerializationFinished(() => resolve())
    })

    // Default `resolveFrame`: dispatch the frame's `src` back through
    // this same handler so `<Frame src="/some/path">` renders the
    // `/some/path` route as the frame's content. Apps override via
    // `opts.resolveFrame` to route some sources elsewhere (cache,
    // external service, etc.).
    const resolveFrame: ServerResolveFrame =
      opts.resolveFrame ??
      (async (src) => {
        const frameUrl = new URL(src, url.origin)
        const frameRes = await handler(new Request(frameUrl))
        if (!frameRes.body) return ''
        return frameRes.body
      })

    const htmlStream = renderToStream(
      <Document>
        <RouterProvider router={router} />
      </Document>,
      {
        onError(error) {
          console.error('[remix-router/server] render error:', error)
        },
        resolveFrame,
      },
    )

    // Stream the HTML to the client as it's produced, holding back the
    // closing `</body>` so the dehydration script can be spliced in front
    // of it once seroval finishes.
    const status = router.stores.statusCode.get() ?? 200
    const responseStream = pipeWithDehydration(htmlStream, {
      finishRender: () => router.serverSsr!.setRenderFinished(),
      waitForSerialization: () =>
        Promise.race([
          serializationDone,
          dehydratePromise.catch(() => undefined),
        ]),
      collectInjection: () => {
        const scripts = router.serverSsr!.takeBufferedScripts()
        const html = router.serverSsr!.takeBufferedHtml() ?? ''

        if (!scripts || !scripts.children) return html
        const attrs = scripts.attrs ?? {}
        const pairs = Object.entries(attrs)
          .filter(([, v]) => v !== undefined && v !== false)
          .map(([k, v]) =>
            v === true ? ` ${k}` : ` ${k}="${escapeHtmlAttr(String(v))}"`,
          )
          .join('')
        return html + `<script${pairs}>${scripts.children}</script>`
      },
      cleanup: () => router.serverSsr!.cleanup(),
    })

    return new Response(responseStream, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  return handler
}

/**
 * Stream the rendered HTML through to the client while holding back the
 * closing `</body></html>` until the dehydration script is ready. Once
 * the upstream stream ends, we lift the SSR script-buffer barrier, await
 * serialization, splice the script in, and finally emit the trailer.
 *
 * This is the streaming counterpart of the buffered "wait for everything,
 * then send" approach. The user agent sees the document head and body
 * markup as soon as it's rendered; the hydration payload lands at the
 * end, just before `</body>`.
 */
function pipeWithDehydration(
  source: ReadableStream<Uint8Array>,
  hooks: {
    finishRender: () => void
    waitForSerialization: () => Promise<unknown>
    collectInjection: () => string
    cleanup: () => void
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending = ''
      const reader = source.getReader()

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          pending += decoder.decode(value, { stream: true })

          // Search for `</body>` in the buffered text. If we don't find
          // it yet, flush most of `pending` (keeping a small lookback in
          // case `</body>` straddles a chunk boundary).
          const idx = pending.indexOf('</body>')
          if (idx === -1) {
            const safe = pending.length - 8 // longest prefix of "</body>"
            if (safe > 0) {
              controller.enqueue(encoder.encode(pending.slice(0, safe)))
              pending = pending.slice(safe)
            }
          } else {
            controller.enqueue(encoder.encode(pending.slice(0, idx)))
            pending = pending.slice(idx)
            // Drain any trailing chunks into `pending` so we keep going.
          }
        }
        pending += decoder.decode()
      } finally {
        reader.releaseLock()
      }

      hooks.finishRender()
      await hooks.waitForSerialization()
      const injection = hooks.collectInjection()

      const bodyIdx = pending.indexOf('</body>')
      if (bodyIdx !== -1) {
        controller.enqueue(
          encoder.encode(pending.slice(0, bodyIdx) + injection + pending.slice(bodyIdx)),
        )
      } else {
        controller.enqueue(encoder.encode(pending + injection))
      }

      hooks.cleanup()
      controller.close()
    },
  })
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
