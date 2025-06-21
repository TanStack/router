import { defineHandlerCallback } from '@tanstack/router-core-ssr/server'
import { reactRenderToString } from './reactRenderToString'
import { RouterServer } from './RouterServer'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) => reactRenderToString({
    router,
    responseHeaders,
    children: <RouterServer router={router} />,
  })
)
