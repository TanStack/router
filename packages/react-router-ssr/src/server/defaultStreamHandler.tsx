import { defineHandlerCallback } from '@tanstack/router-core-ssr/server'
import { RouterServer } from './RouterServer'
import { reactRenderToStream } from './reactRenderToStream'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    reactRenderToStream({
      request,
      router,
      responseHeaders,
      children: <RouterServer router={router} />,
    }),
)
