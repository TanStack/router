import { createMemoryHistory } from '@tanstack/history'
import { mergeHeaders } from '@tanstack/start-client-core'
import { eventHandler, getResponseHeaders, toWebRequest } from 'h3'
import { attachRouterServerSsrUtils, dehydrateRouter } from './ssr-server'
import type { HandlerCallback } from './handlerCallback'
import type { EventHandlerResponse, H3Event } from 'h3'
import type { AnyRouter, Manifest } from '@tanstack/router-core'

export type CustomizeStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> = (cb: HandlerCallback<TRouter, TResponse>) => ReturnType<typeof eventHandler>

export function createStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
>({
  createRouter,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  getRouterManifest?: () => Manifest | Promise<Manifest>
}): CustomizeStartHandler<TRouter, TResponse> {
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

      attachRouterServerSsrUtils(router, await getRouterManifest?.())

      // Update the router with the history and context
      router.update({
        history,
      })

      await router.load()

      dehydrateRouter(router)

      const responseHeaders = getStartResponseHeaders({ event, router })
      const response = await cb({
        request,
        router,
        responseHeaders,
      })

      return response
    })
  }
}

function getStartResponseHeaders(opts: { event: H3Event; router: AnyRouter }) {
  let headers = mergeHeaders(
    getResponseHeaders(opts.event),
    (opts.event as any).___ssrRpcResponseHeaders,
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
