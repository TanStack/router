/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import {
  RouterContextProvider,
  RouterProvider,
  Scripts,
} from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Top-level Remix UI factory component that mounts the TanStack Router
 * tree on the client. Mirrors the body content of `<StartServer>` —
 * `<RouterProvider>` for the active match tree plus `<Scripts>` so the
 * SSR-emitted script tags don't get diffed away during hydration.
 *
 * Mounted against `document.body` (not `documentElement`), so the
 * vnode root's children are body-level — matching the existing SSR'd
 * DOM 1:1.
 */
export function StartClient(_handle: Handle<{ router: AnyRouter }>) {
  return ({ router }: { router: AnyRouter }) => (
    <RouterContextProvider router={router}>
      <RouterProvider router={router} />
      <Scripts />
    </RouterContextProvider>
  )
}

/**
 * Remix-specific hydrateStart wrapper. Mirrors the React/Solid bindings:
 * runs the core hydrate (consumes the seroval-streamed dehydration
 * payload), then signals the SSR runtime that hydration finished so any
 * pending stream cleanup can fire.
 */
export async function hydrateStart(): Promise<AnyRouter> {
  const router = await coreHydrateStart()
  ;(window as any).$_TSR?.h?.()
  return router
}
