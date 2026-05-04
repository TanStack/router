/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { defineHandlerCallback } from '@tanstack/router-core/ssr/server'
import {
  HeadContent,
  RouterContextProvider,
  RouterProvider,
  Scripts,
} from '@tanstack/remix-router'
import {
  renderRouterToStream,
  renderRouterToString,
} from '@tanstack/remix-router/ssr/server'
import type { Handle } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Top-level Remix UI factory used by the default server entry. Owns the
 * document shell — `<html>/<head>/<body>` — so route components can
 * stay focused on the body content. On the client, hydration mounts
 * into `document.body` against the same body-content tree the route
 * renders, avoiding the `<html>`-as-rendered-root mismatch you'd hit
 * trying to hydrate `document.documentElement`.
 *
 * `<RouterContextProvider>` lives at the top so `<HeadContent>` (in
 * `<head>`) and `<Scripts>` (at end of `<body>`) can both find the
 * router. Inside the body, `<RouterProvider>` renders the active match
 * tree.
 */
export function StartServer<TRouter extends AnyRouter>(
  _handle: Handle<{ router: TRouter }>,
) {
  return ({ router }: { router: TRouter }) => (
    <RouterContextProvider router={router}>
      <html>
        <head>
          <HeadContent />
        </head>
        <body>
          <RouterProvider router={router} />
          <Scripts />
        </body>
      </html>
    </RouterContextProvider>
  )
}

/**
 * `defineHandlerCallback`-shaped streaming handler. The Start
 * counterpart of the binding-level `defaultStreamHandler` from
 * `@tanstack/remix-router/ssr/server` — same render primitive, but
 * wraps with `<StartServer>` (which provides the document shell) so
 * the response is a complete HTML document.
 *
 * This is what the default Start server entry plugs into Start's
 * `createStartHandler`.
 */
export const defaultStreamHandler = defineHandlerCallback(
  ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      children: () => <StartServer router={router} />,
    }),
)

/**
 * Non-streaming counterpart for environments that don't support
 * streaming (older Lambda runtimes, cron jobs, etc.).
 */
export const defaultRenderHandler = defineHandlerCallback(
  ({ router, responseHeaders }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: () => <StartServer router={router} />,
    }),
)

// Re-export the binding-level pieces (these do NOT include the
// document shell — for callers who want to compose their own).
export {
  renderRouterToStream,
  renderRouterToString,
  RouterServer,
} from '@tanstack/remix-router/ssr/server'

// Re-export everything from start-server-core (createStartHandler,
// request helpers, virtual modules) — the `./server` entry point is
// the framework-binding-aware surface for server-side code.
export * from '@tanstack/start-server-core'
