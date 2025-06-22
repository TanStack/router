import { defineHandlerCallback } from '@tanstack/router-ssr-core/server'
import { RouterServer } from './RouterServer'
import { solidRenderToStream } from './solidRenderToStream'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    solidRenderToStream({
      request,
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
)
