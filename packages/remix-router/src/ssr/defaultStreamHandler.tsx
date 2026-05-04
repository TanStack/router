/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import { RouterServer } from './RouterServer'
import { renderRouterToStream } from './renderRouterToStream'

/**
 * `defineHandlerCallback`-shaped streaming handler. Drop-in equivalent
 * to `defaultStreamHandler` in the React/Solid bindings — Start's
 * `createStartHandler` invokes it with `{ request, router,
 * responseHeaders }` after running its middleware chain and loading
 * the router.
 *
 * Mirrored to `@tanstack/remix-start/server` for the Start integration.
 */
export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      children: () => <RouterServer router={router} />,
    }),
)
