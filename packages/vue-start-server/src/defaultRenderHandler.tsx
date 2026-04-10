import { defineHandlerCallback } from '@tanstack/start-server-core'
import { renderRouterToString } from '@tanstack/vue-router/ssr/server'
import { StartServer } from './StartServer'

export const defaultRenderHandler: ReturnType<typeof defineHandlerCallback> =
  defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      App: StartServer,
    }),
)
