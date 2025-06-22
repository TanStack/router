import { defineHandlerCallback } from '@tanstack/start-server-core'
import { solidRenderToStream } from '@tanstack/solid-router-ssr/server'
import { StartServer } from './StartServer'

export const defaultStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders }) =>
    await solidRenderToStream({
      request,
      router,
      responseHeaders,
      children: () => <StartServer router={router} />,
    }),
)
