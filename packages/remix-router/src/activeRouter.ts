import type { AnyRouter } from '@tanstack/router-core'

/**
 * Module-level reference to the currently mounted router. Set by
 * `mountRouter` (or manually via `setActiveRouter`) so that
 * `clientEntry`-hydrated components — which can't reach `handle.context`
 * because they live outside the `<RouterProvider>` tree — can still find
 * the router instance.
 *
 * One router per page is the assumption. If your app uses multiple
 * routers, prefer the standard `<RouterProvider>` model.
 */
let active: AnyRouter | null = null

export function setActiveRouter(router: AnyRouter): void {
  active = router
}

export function getActiveRouter(): AnyRouter {
  if (!active) {
    throw new Error(
      '@tanstack/remix-router: no active router. Call setActiveRouter(router) ' +
        'or mountRouter(router) before rendering clientEntry components.',
    )
  }
  return active
}

export function clearActiveRouter(): void {
  active = null
}
