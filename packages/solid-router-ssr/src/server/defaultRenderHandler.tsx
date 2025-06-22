import { defineHandlerCallback } from '@tanstack/router-ssr-core/server'
import { RouterServer } from './RouterServer'
import { renderRouterToString } from './renderRouterToString'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
)
