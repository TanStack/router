import { defineHandlerCallback } from '@tanstack/router-ssr-core/server'
import { RouterServer } from './RouterServer'
import { solidRenderToString } from './solidRenderToString'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) => solidRenderToString({ router, responseHeaders, children: () => <RouterServer router={router} /> })
)
