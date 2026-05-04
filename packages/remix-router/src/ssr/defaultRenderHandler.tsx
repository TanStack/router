/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { RouterServer } from './RouterServer'
import { renderRouterToString } from './renderRouterToString'

/**
 * `defineHandlerCallback`-shaped non-streaming handler. Drop-in
 * equivalent to `defaultRenderHandler` in the React/Solid bindings.
 * Renders the entire response into a string before flushing — useful
 * for bots, edge-case crawlers, or environments where streaming isn't
 * supported.
 */
export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
)
