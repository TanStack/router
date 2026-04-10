import {
  defineHandlerCallback,
  renderRouterToString,
} from '@tanstack/react-router/ssr/server'
import { StartServer } from './StartServer'

export const defaultRenderHandler: ReturnType<typeof defineHandlerCallback> =
  defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <StartServer router={router} />,
    }),
)
