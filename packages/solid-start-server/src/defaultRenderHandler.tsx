import { defineHandlerCallback } from '@tanstack/start-server-core'
import { solidRenderToString } from '@tanstack/solid-router-ssr/server'
import { StartServer } from './StartServer'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) => solidRenderToString({ router, responseHeaders, children: () => <StartServer router={router} /> })
)
