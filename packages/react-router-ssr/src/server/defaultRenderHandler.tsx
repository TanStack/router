import { defineHandlerCallback } from '@tanstack/router-ssr-core/server'
import { renderRouterToString } from './renderRouterToString'
import { RouterServer } from './RouterServer'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
)
