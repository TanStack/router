/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { hydrate } from '@tanstack/router-core/ssr/client'
import { RouterProvider } from '../RouterProvider'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<unknown> | undefined

/**
 * Client entry component. Hydrates the router from the SSR-injected
 * payload (read once across all instances) and then renders
 * `<RouterProvider>`.
 *
 * Mirrors `RouterClient` from `@tanstack/react-router/ssr/client`.
 */
export function RouterClient(handle: Handle<{ router: AnyRouter }>) {
  let ready = false

  return ({ router }: { router: AnyRouter }): RemixNode => {
    if (!hydrationPromise) {
      if (!router.stores.matchesId.get().length) {
        hydrationPromise = hydrate(router as any)
      } else {
        hydrationPromise = Promise.resolve()
      }
      hydrationPromise.then(() => {
        ready = true
        void handle.update()
      })
    }
    if (!ready) return null
    return <RouterProvider router={router} />
  }
}
