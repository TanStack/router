import { renderToString } from '@remix-run/ui/server'
import { getServerComponent } from './serverComponent'

/**
 * Default mount path for the server-component re-render endpoint.
 * Override via `createRouterHandler({ serverComponentBase })`.
 */
export const DEFAULT_SERVER_COMPONENT_BASE = '/_sc'

/**
 * Plain Web-Request handler that re-renders a registered server
 * component on demand. Mounted at `${serverComponentBase}/<id>`,
 * accepts `POST` with a JSON body of the new props.
 *
 * Returns an HTML response containing just the bracketed component's
 * markup (no document shell). The client runtime drops the markup into
 * the matching `<span data-rmx-sc>` element via `innerHTML`.
 *
 * `createRouterHandler` mounts this at `/_sc/*` automatically — it's
 * exposed here so apps that prefer routing the endpoint themselves
 * (e.g. through their own middleware stack) can do so.
 */
export interface ServerComponentEndpointOptions {
  /** Path prefix to handle. Default: `/_sc`. */
  base?: string
}

/**
 * Errors thrown from inside `handleServerComponentRequest` are
 * surfaced as 500 with a small JSON body in dev, generic text in prod.
 */
function errorResponse(error: unknown, status = 500): Response {
  const isDev = process.env.NODE_ENV !== 'production'
  const body = isDev
    ? JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        stack:
          error instanceof Error
            ? error.stack?.split('\n').slice(0, 6).join('\n')
            : undefined,
      })
    : 'Internal Server Error'
  return new Response(body, {
    status,
    headers: {
      'content-type': isDev ? 'application/json' : 'text/plain',
    },
  })
}

/**
 * Handle a single server-component re-render request. Returns the
 * rendered HTML string in a `Response`.
 *
 * Path shape: `${base}/<componentId>`. ComponentId is the literal
 * string passed to `serverComponent('<id>', …)`.
 */
export async function handleServerComponentRequest(
  request: Request,
  opts: ServerComponentEndpointOptions = {},
): Promise<Response> {
  const base = opts.base ?? DEFAULT_SERVER_COMPONENT_BASE
  const url = new URL(request.url)
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (!url.pathname.startsWith(prefix)) {
    return errorResponse(`Path ${url.pathname} not under ${prefix}`, 404)
  }

  const id = decodeURIComponent(url.pathname.slice(prefix.length))
  if (!id) return errorResponse('Missing server component id', 400)

  const entry = getServerComponent(id)
  if (!entry) {
    return errorResponse(
      `Server component "${id}" is not registered. Make sure the module ` +
        'that defines it is imported on the server.',
      404,
    )
  }

  let props: unknown = {}
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const ct = request.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      try {
        const text = await request.text()
        props = text ? JSON.parse(text) : {}
      } catch (err) {
        return errorResponse(err, 400)
      }
    }
  } else {
    const raw = url.searchParams.get('props')
    if (raw) {
      try {
        props = JSON.parse(raw)
      } catch (err) {
        return errorResponse(err, 400)
      }
    }
  }

  // Render in isolation: no document, no router context. The factory is
  // expected to be self-contained — server-component bodies that need
  // request context must read it via the request param plumbed through
  // `serverComponent`'s factory (a future feature).
  try {
    const fakeHandle = createServerComponentHandle(props)
    const renderFn = entry.factory(fakeHandle as any)
    const tree = renderFn(props as any)
    const html = await renderToString(tree as any)
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}

/**
 * Minimal `Handle`-shape used when rendering a server component
 * standalone for a re-render request. The factory typically ignores
 * `handle` (server components are pure functions of props) but we still
 * need a non-throwing stand-in.
 */
function createServerComponentHandle(props: unknown): Record<string, unknown> {
  let renderUpdates = 0
  const noopAbort: AbortSignal = (() => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.abort === 'function') {
      try {
        return AbortSignal.abort()
      } catch {
        // fall through
      }
    }
    const ctrl = new AbortController()
    ctrl.abort()
    return ctrl.signal
  })()
  return {
    id: 'server-component',
    props,
    update: () => Promise.resolve(noopAbort),
    queueTask: (_task: unknown) => {
      renderUpdates += 1
      void renderUpdates
    },
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    signal: noopAbort,
    frame: undefined,
    frames: { top: undefined, get: () => undefined },
  }
}
