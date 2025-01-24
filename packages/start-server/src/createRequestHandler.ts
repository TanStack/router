import { createMemoryHistory } from '@tanstack/react-router'
import { mergeHeaders } from '@tanstack/start-client'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import type { AnyRouter, Manifest } from '@tanstack/react-router'
import type { HandlerCallback } from './defaultStreamHandler'

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
  getRouterManifest?: () => Manifest
}): RequestHandler<TRouter> {
  return async (cb) => {
    const router = createRouter()

    attachRouterServerSsrUtils(router, getRouterManifest?.())

    const url = new URL(request.url, 'http://localhost')

    const href = url.href.replace(url.origin, '')

    // Create a history for the router
    const history = createMemoryHistory({
      initialEntries: [href],
    })

    // Update the router with the history and context
    router.update({
      history,
    })

    await router.load()

    dehydrateRouter(router)

    const responseHeaders = getRequestHeaders({
      router,
    })

    return cb({
      request,
      router,
      responseHeaders,
    } as any)
  }
}

function getRequestHeaders(opts: { router: AnyRouter }): Headers {
  let headers = mergeHeaders(
    {
      'Content-Type': 'text/html; charset=UTF-8',
    },
    ...opts.router.state.matches.map((match) => {
      return match.headers
    }),
  )

  // Handle Redirects
  const { redirect } = opts.router.state

  if (redirect) {
    headers = mergeHeaders(headers, redirect.headers, {
      Location: redirect.href,
    })
  }

  return headers
}
