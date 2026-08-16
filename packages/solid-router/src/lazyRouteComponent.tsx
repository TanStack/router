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
        // Explicit opt-out of the renderer's per-module asset registration
        // and preloaded-module hydration shortcut: route chunks bundle many
        // routes, so registering the chunk would emit the union of their
        // CSS on every route (breaking per-route isolation), and the
        // shortcut assumes the chunk's default export is the component —
        // untrue for this wrapper's named-export selection. Route assets
        // are served by TanStack's route-keyed manifest, and hydration is
        // synchronous because preload() below warms lazy()'s component
        // cache before the router renders.
        $$moduleUrl: null,
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
