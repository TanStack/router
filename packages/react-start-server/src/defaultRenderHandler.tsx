import {
  defineHandlerCallback,
  reactRenderToString,
} from '@tanstack/react-router-ssr/server'
import { StartServer } from './StartServer'

export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    reactRenderToString({
      router,
      responseHeaders,
      children: <StartServer router={router} />,
    }),
)
