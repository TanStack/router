import * as React from 'react'
import { Outlet } from './Match'
import type { AsyncRouteComponent } from './route'

// If the load fails due to module not found, it may mean a new version of
// the build was deployed and the user's browser is still using an old version.
// If this happens, the old version in the user's browser would have an outdated
// URL to the lazy module.
// In that case, we want to attempt one window refresh to get the latest.
function isModuleNotFoundError(error: any): boolean {
  return (
    typeof error?.message === 'string' &&
    /Failed to fetch dynamically imported module/.test(error.message)
  )
}

export function ClientOnly({
  children,
  fallback = null,
}: React.PropsWithChildren<{ fallback?: React.ReactNode }>) {
  return useHydrated() ? <>{children}</> : <>{fallback}</>
}

function subscribe() {
  return () => {}
}

export function useHydrated() {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}

export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
  ssr?: () => boolean,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let loadPromise: Promise<any> | undefined
  let comp: T[TKey] | T['default']
  let error: any

  const load = () => {
    if (typeof document === 'undefined' && ssr?.() === false) {
      comp = (() => null) as any
      return Promise.resolve()
    }
    if (!loadPromise) {
      loadPromise = importer()
        .then((res) => {
          loadPromise = undefined
          comp = res[exportName ?? 'default']
        })
        .catch((err) => {
          error = err
        })
    }

    return loadPromise
  }

  const lazyComp = function Lazy(props: any) {
    // Now that we're out of preload and into actual render path,
    // throw the error if it was a module not found error during preload
    if (error) {
      if (isModuleNotFoundError(error)) {
        // We don't want an error thrown from preload in this case, because
        // there's nothing we want to do about module not found during preload.
        // Record the error, recover the promise with a null return,
        // and we will attempt module not found resolution during the render path.

        if (
          error instanceof Error &&
          typeof window !== 'undefined' &&
          typeof sessionStorage !== 'undefined'
        ) {
          // Again, we want to reload one time on module not found error and not enter
          // a reload loop if there is some other issue besides an old deploy.
          // That's why we store our reload attempt in sessionStorage.
          // Use error.message as key because it contains the module path that failed.
          const storageKey = `tanstack_router_reload:${error.message}`
          if (!sessionStorage.getItem(storageKey)) {
            sessionStorage.setItem(storageKey, '1')
            window.location.reload()

            // Return empty component while we wait for window to reload
            return {
              default: () => null,
            }
          }
        }
      }

      // Otherwise, just throw the error
      throw error
    }

    if (!comp) {
      throw load()
    }

    if (ssr?.() === false) {
      return (
        <ClientOnly fallback={<Outlet />}>
          {React.createElement(comp, props)}
        </ClientOnly>
      )
    }
    return React.createElement(comp, props)
  }

  ;(lazyComp as any).preload = load

  return lazyComp as any
}
