import { createBrowserHistory } from '@tanstack/history'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { setActiveRouter } from './activeRouter'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Bind a TanStack Router instance to the document and start it.
 *
 * Pairs with the rest of the app entry — typically you also call
 * `run({ loadModule, resolveFrame })` from `@remix-run/ui` so the
 * Remix component runtime is mounted. The pieces are independent: this
 * function just wires `router.history`, hydrates dehydrated state, and
 * triggers the first load.
 *
 * @example
 * ```ts
 * import { run } from '@remix-run/ui'
 * import { mountRouter } from '@tanstack/remix-router'
 * import { router } from './router'
 *
 * await mountRouter(router)
 * run({ loadModule: (url) => import(url) })
 * ```
 */
export async function mountRouter(router: AnyRouter): Promise<void> {
  if (!router.history) {
    router.update({
      ...router.options,
      history: createBrowserHistory(),
    })
  }

  // Pick up the SSR-injected dehydrated payload, if any.
  if (typeof document !== 'undefined') {
    await hydrate(router as any)
  }

  await router.load()

  // Expose the router via the module-level singleton so `clientEntry`
  // components rendered outside the `<RouterProvider>` tree can find it.
  setActiveRouter(router)
}
