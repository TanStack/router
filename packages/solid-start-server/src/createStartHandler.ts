import path from 'node:path'
import { createMemoryHistory } from '@tanstack/history'
import { eventHandler, toWebRequest } from 'h3'
import { attachRouterServerSsrUtils, dehydrateRouter, getStartManifest, getStartResponseHeaders, serverFunctionsHandler } from '@tanstack/start-server-core'
import type { EventHandlerResponse } from 'h3'
import type { AnyRouter } from '@tanstack/router-core'
import type { CustomizeStartHandler } from '@tanstack/start-server-core';

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
          'tanstack/solid-start-server: TSS_SERVER_FN_BASE must be defined in your environment for createStartHandler()',
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