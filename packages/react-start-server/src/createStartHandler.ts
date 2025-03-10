import path from 'node:path'
import { createMemoryHistory } from '@tanstack/history'
import { mergeHeaders } from '@tanstack/start-client-core'
import { eventHandler, getResponseHeaders, toWebRequest } from 'h3'
import {
  attachRouterServerSsrUtils,
  dehydrateRouter,
  getStartManifest,
} from '@tanstack/start-server-core'
import serverFunctionsHandler from './server-functions-handler'
import type { HandlerCallback } from '@tanstack/start-server-core'
import type { EventHandlerResponse, H3Event } from 'h3'
import type { AnyRouter } from '@tanstack/router-core'

export type CustomizeStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
> = (cb: HandlerCallback<TRouter, TResponse>) => ReturnType<typeof eventHandler>

export function createStartHandler<
  TRouter extends AnyRouter,
  TResponse extends EventHandlerResponse = EventHandlerResponse,
>({
  createRouter,
}: {
  createRouter: () => TRouter
}): CustomizeStartHandler<TRouter, TResponse> {
  return (cb) => {
    return eventHandler(async (event) => {
      const request = toWebRequest(event)

      const url = new URL(request.url)
      const href = url.href.replace(url.origin, '')

      if (!process.env.TSS_SERVER_FN_BASE) {
        throw new Error(
          'tanstack/react-start-server: TSS_SERVER_FN_BASE must be defined in your environment for createStartHandler()',
        )
      }

      // Handle server functions
      if (
        href.startsWith(path.join('/', process.env.TSS_SERVER_FN_BASE, '/'))
      ) {
        return await serverFunctionsHandler(event)
      }

      // Handle API routes
      // handleApiRoutes(event)
      // if (event.handled) {
      //   return
      // }

      // If no API routes returned, then fallback to SSR on the router

      // Create a history for the router
      const history = createMemoryHistory({
        initialEntries: [href],
      })

      const router = createRouter()

      attachRouterServerSsrUtils(router, getStartManifest())

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
