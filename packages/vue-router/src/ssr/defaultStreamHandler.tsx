import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { renderRouterToStream } from './renderRouterToStream'
import { RouterServer } from './RouterServer'
import type { HandlerCallback } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

export const defaultStreamHandler: HandlerCallback<AnyRouter> = defineHandlerCallback(
  async ({ request, router, responseHeaders }) =>
    await renderRouterToStream({
      request,
      router,
      responseHeaders,
      App: RouterServer,
    }),
)
