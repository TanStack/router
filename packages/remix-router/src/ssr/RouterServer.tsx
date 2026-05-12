/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'
import type { Handle } from '@remix-run/ui'

/**
 * Minimal SSR-tree wrapper. Mirrors `<RouterServer>` from
 * `@tanstack/solid-router/ssr/server` and React's equivalent — the
 * server-side `<RouterProvider>` with no extra plumbing beyond passing
 * the router prop through. Apps wanting the full document shell wrap
 * this with their own `<html>/<head>/<body>` (or use
 * `<StartServer>` from `@tanstack/remix-start/server`).
 */
export function RouterServer<TRouter extends AnyRouter>(
  _handle: Handle<{ router: TRouter }>,
) {
  return ({ router }: { router: TRouter }) => (
    <RouterProvider router={router} />
  )
}
