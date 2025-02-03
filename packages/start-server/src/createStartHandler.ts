import { createMemoryHistory } from '@tanstack/react-router'
import { mergeHeaders } from '@tanstack/start-client'
import { eventHandler, getResponseHeaders, toWebRequest } from 'h3'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import type { H3Event } from 'h3'
import type { AnyRouter, Manifest } from '@tanstack/react-router'
import type { HandlerCallback } from './defaultStreamHandler'

export type CustomizeStartHandler<TRouter extends AnyRouter> = (
  cb: HandlerCallback<TRouter>,
) => ReturnType<typeof eventHandler>

export function createStartHandler<TRouter extends AnyRouter>({
  createRouter,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  getRouterManifest?: () => Manifest
}): CustomizeStartHandler<TRouter> {
  return (cb) => {
    return eventHandler(async (event) => {
      const request = toWebRequest(event)

      const url = new URL(request.url)
      const href = url.href.replace(url.origin, '')

      // Create a history for the router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      const router = createRouter()

      attachRouterServerSsrUtils(router, getRouterManifest?.())

      // Update the router with the history and context
      router.update({
        history,
      })

      await router.load()

      dehydrateRouter(router)

      const responseHeaders = getRequestHeaders({
        event,
        router,
      })

      const response = await cb({
        request,
        router,
        responseHeaders,
      })

      return response
    })
  }
}

function getRequestHeaders(opts: {
  event: H3Event
  router: AnyRouter
}): Headers {
  ;(opts.event as any).__tsrHeadersSent = true

  let headers = mergeHeaders(
    getResponseHeaders(opts.event),
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
