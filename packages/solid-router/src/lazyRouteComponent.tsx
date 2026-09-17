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
  const resolvedExport = (exportName as string | undefined) ?? 'default'
  let preloadPromise: Promise<void> | undefined

  // lazy()'s { export } option names which export of the resolved module is
  // the component — a call-site literal available on both runtimes, so the
  // module namespace passes through untouched ($$moduleUrl included, which
  // is how server-side lazy() resolves the route chunk's client assets) and
  // hydration claims the component synchronously from the preloaded module.
  const comp = lazy(
    () =>
      importer().catch((error) => {
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
            return { [resolvedExport]: () => null } as unknown as T
          }
        }

        throw error
      }),
    { export: resolvedExport },
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

  return comp as any
}
