import { createMemoryHistory } from '@tanstack/history'
import { mergeHeaders } from './headers'
import {
  attachRouterServerSsrUtils,
  getNormalizedURL,
  getOrigin,
} from './ssr-server'
import type { HandlerCallback } from './handlerCallback'
import type { AnyHeaders } from './headers'
import type { AnyRouter } from '../router'
import type { Manifest } from '../manifest'

export type RequestHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => Promise<Response>

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  request,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  request: Request
  getRouterManifest?: () => Manifest | Promise<Manifest>
}): RequestHandler<TRouter> {
  return async (cb) => {
    const router = createRouter()
    // Track whether the callback will handle cleanup
    let cbWillCleanup = false

    try {
      attachRouterServerSsrUtils({
        router,
        manifest: await getRouterManifest?.(),
      })

      // normalizing and sanitizing the pathname here for server, so we always deal with the same format during SSR.
      const { url } = getNormalizedURL(request.url, 'http://localhost')
      const origin = getOrigin(request)
      const href = url.href.replace(url.origin, '')

      // Create a history for the router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      // Update the router with the history and context
      router.update({
        history,
        origin: router.options.origin ?? origin,
      })

      await router.load()

      await router.serverSsr?.dehydrate()

      const responseHeaders = getRequestHeaders({
        router,
      })

      // Mark that the callback will handle cleanup
      cbWillCleanup = true
      return cb({
        request,
        router,
        responseHeaders,
      } as any)
    } finally {
      if (!cbWillCleanup) {
        // Clean up router SSR state if the callback won't handle it
        // (e.g., if an error occurred before the callback was invoked).
        // When the callback runs, it handles cleanup (either via transformStreamWithRouter
        // for streaming, or directly in renderRouterToString for non-streaming).
        router.serverSsr?.cleanup()
      }
    }
  }
}

function getRequestHeaders(opts: { router: AnyRouter }): Headers {
  const matchHeaders = opts.router.state.matches.map<AnyHeaders>(
    (match) => match.headers,
  )

  // Handle Redirects
  const { redirect } = opts.router.state
  if (redirect) {
    matchHeaders.push(redirect.headers)
  }

  return mergeHeaders(
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...matchHeaders,
  )
}
