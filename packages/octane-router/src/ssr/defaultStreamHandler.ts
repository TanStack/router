import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { RouterServer } from './RouterServer.tsrx'
import { renderRouterToStream } from './renderRouterToStream'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      App: RouterServer,
    }),
)
