import { lazy } from 'solid-js'
import { isModuleNotFoundError } from '@tanstack/router-core'
import type { AsyncRouteComponent } from './route'

export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let preloadPromise: Promise<void> | undefined

  const comp = lazy(() =>
    importer().then(
      (res) => ({
        default: res[exportName ?? 'default'] as any,
        // Server-side lazy() resolves the module's client assets (CSS,
        // modulepreload hints) by reading the $$moduleUrl export the
        // bundler's SSR transform appends to project modules. Split route
        // modules get per-module manifest entries (the query is part of the
        // module identity), so registration is per-route precise; the head
        // registry dedupes against TanStack's route-keyed manifest links by
        // URL.
        $$moduleUrl: (res as any).$$moduleUrl,
      }),
      (error) => {
        // If the load fails due to module not found, it may mean a new
        // version of the build was deployed and the user's browser is still
        // using an old version with an outdated URL to the lazy module. In
        // that case, attempt one window refresh to get the latest — gated
        // through sessionStorage so some other issue can't cause a reload
        // loop.
        if (
          isModuleNotFoundError(error) &&
          error instanceof Error &&
          typeof window !== 'undefined' &&
          typeof sessionStorage !== 'undefined'
        ) {
          const storageKey = `tanstack_router_reload:${error.message}`
          if (!sessionStorage.getItem(storageKey)) {
            sessionStorage.setItem(storageKey, '1')
            window.location.reload()

            // The page is reloading; render nothing in the meantime.
            return { default: () => null }
          }
        }

        throw error
      },
    ),
  )

  const load = comp.preload

  // TanStack's preload contract: a memoized Promise<void> that never
  // rejects. lazy() does not cache rejected module promises, so a failed
  // download is retried by the next preload or render.
  comp.preload = () => {
    if (!preloadPromise) {
      preloadPromise = load().then(
        () => {},
        () => {
          preloadPromise = undefined
        },
      )
    }
    return preloadPromise
  }

  return comp
}
