import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { renderRouterToString } from './renderRouterToString'
import { RouterServer } from './RouterServer'
import type { HandlerCallback } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

export const defaultRenderHandler: HandlerCallback<AnyRouter> = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      App: RouterServer,
    }),
)
