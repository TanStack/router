import { defineHandlerCallback, reactRenderToStream } from '@tanstack/react-router-ssr/server'
import { StartServer } from './StartServer'

export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) => reactRenderToStream({
    request,
    router,
    responseHeaders,
    children: <StartServer router={router} />,
  })
)
