import { eventHandler, toWebRequest } from 'vinxi/http'
import { type AnyRouter, createMemoryHistory } from '@tanstack/react-router'
import { getRequestHeaders } from './getRequestHeaders'
import type { Manifest } from '@tanstack/react-router'
import type { EventHandler } from 'vinxi/http'

export type RequestHandler<TRouter extends AnyRouter> = (ctx: {
  request: Request
  router: TRouter
  responseHeaders: Headers
}) => Promise<Response>

export type CustomizeRequestHandler<TRouter extends AnyRouter> = (
  cb: RequestHandler<TRouter>,
) => EventHandler

export function createRequestHandler<TRouter extends AnyRouter>({
  createRouter,
  getRouterManifest,
}: {
  createRouter: () => TRouter
  getRouterManifest?: () => Manifest
}): CustomizeRequestHandler<TRouter> {
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

      if (getRouterManifest) {
        router.manifest = getRouterManifest()
      }

      // Update the router with the history and context
      router.update({
        history,
      })

      await router.load()

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
