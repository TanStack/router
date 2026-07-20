import { createMemoryHistory } from '@tanstack/history'
import { waitForReason } from '../await-signal'
import { _getRenderedMatches } from '../rendered-matches'
import { mergeHeaders } from './headers'
import {
  attachRouterServerSsrUtils,
  getNormalizedURL,
  getOrigin,
} from './ssr-server'
import {
  bindSsrResponseToRequest,
  disposeSsrResponseDetached,
  normalizeSsrResponse,
} from './handlerCallback'
import type { HandlerCallback } from './handlerCallback'
import type { AnyHeaders } from './headers'
import type { AnyRouter } from '../router'
import type { ServerManifest } from '../manifest'

export type RequestHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => Promise<Response>

export function waitForRequest<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
  onLate?: (value: T) => void,
): Promise<T> {
  return waitForReason(value, signal, onLate)
}

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  request,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  request: Request
  getRouterManifest?: () => ServerManifest | Promise<ServerManifest>
}): RequestHandler<TRouter> {
  return async (cb) => {
    request.signal.throwIfAborted()
    const router = createRouter()
    let responseOwnsCleanup = false

    try {
      attachRouterServerSsrUtils({
        router,
        manifest: await waitForRequest(getRouterManifest?.(), request.signal),
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

      await router.load({
        _signal: request.signal,
      })
      request.signal.throwIfAborted()

      const result = router._serverResult
      if (result?.type === 'redirect') {
        return result.redirect
      }

      await waitForRequest(router.serverSsr?.dehydrate(), request.signal)
      request.signal.throwIfAborted()

      const responseHeaders = getRequestHeaders({
        router,
      })

      request.signal.throwIfAborted()
      const response = await waitForRequest(
        cb({
          request,
          router,
          responseHeaders,
        }),
        request.signal,
        (late) => {
          const ssrResponse = normalizeSsrResponse(late)
          if (ssrResponse.serverSsrCleanup === 'stream') {
            disposeSsrResponseDetached(ssrResponse, request.signal.reason)
          }
        },
      )
      const ssrResponse = bindSsrResponseToRequest(
        router,
        response,
        request.signal,
      )
      request.signal.throwIfAborted()
      responseOwnsCleanup = ssrResponse.serverSsrCleanup === 'stream'
      return ssrResponse.response
    } finally {
      if (!responseOwnsCleanup) {
        // Clean up router SSR state if the callback won't handle it
        // (e.g., if an error occurred before the callback was invoked).
        // Transformed streaming response bodies clean up when consumed/cancelled.
        router.serverSsr?.cleanup()
      }
    }
  }
}

function getRequestHeaders(opts: { router: AnyRouter }): Headers {
  const matchHeaders: Array<AnyHeaders> = []
  for (const match of _getRenderedMatches(opts.router.stores.matches.get())) {
    matchHeaders.push(match.headers)
  }

  return mergeHeaders(
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...matchHeaders,
  )
}
