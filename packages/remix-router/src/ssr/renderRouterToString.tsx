/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { renderToString } from '@remix-run/ui/server'
import type { RemixNode } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Non-streaming SSR for the Remix UI binding. Mirrors
 * `renderRouterToString` from `@tanstack/solid-router/ssr/server`:
 * fully drains the render before responding, splices the dehydration
 * payload in front of `</body>`, and returns a Response.
 *
 * Use this as the handler callback when you don't need streaming
 * (bots, simple cron-render targets, environments where streaming
 * isn't supported). For most apps prefer `renderRouterToStream` —
 * faster TTFB.
 */
export const renderRouterToString = async ({
  router,
  responseHeaders,
  children,
}: {
  router: AnyRouter
  responseHeaders: Headers
  children: () => RemixNode
}): Promise<Response> => {
  try {
    let html = await renderToString(children() as any)
    router.serverSsr!.setRenderFinished()

    const injectedHtml = router.serverSsr!.takeBufferedHtml()
    if (injectedHtml) {
      html = html.replace(`</body>`, () => `${injectedHtml}</body>`)
    }
    return new Response(`<!DOCTYPE html>${html}`, {
      status: router.stores.statusCode.get() ?? 200,
      headers: ensureHtmlContentType(responseHeaders),
    })
  } catch (error) {
    console.error('[remix-router/ssr] render-to-string error:', error)
    const message = error instanceof Error ? error.message : String(error)
    const isDev = process.env.NODE_ENV !== 'production'
    const body = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>500 — server render error</title></head><body><h1>500 — Server render error</h1>${
      isDev
        ? `<pre>${escapeHtml(message)}</pre>`
        : '<p>The server encountered an unexpected error while rendering this page.</p>'
    }</body></html>`
    return new Response(body, {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  } finally {
    router.serverSsr?.cleanup()
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Defensive: ensure the SSR response declares `content-type:
 * text/html`. Most Start handlers set this upstream, but a missing
 * header causes browsers to download instead of render — pin it here
 * so the binding is safe to use without the full Start pipeline.
 */
function ensureHtmlContentType(headers: Headers): Headers {
  if (headers.has('content-type')) return headers
  const next = new Headers(headers)
  next.set('content-type', 'text/html; charset=utf-8')
  return next
}
