import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { RouterServer } from './RouterServer'
import { renderRouterToStream } from './renderRouterToStream'
import type { HandlerCallback } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'

export const defaultStreamHandler: HandlerCallback<AnyRouter> = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
)
