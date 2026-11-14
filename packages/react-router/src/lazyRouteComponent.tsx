import * as React from 'react'
import { isModuleNotFoundError } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { reactUse } from './utils'
import type { AsyncRouteComponent } from './route'

/**
 * Wrap a dynamic import to create a route component that supports
 * `.preload()` and friendly reload-on-module-missing behavior.
 *
 * @param importer Function returning a module promise
 * @param exportName Named export to use (default: `default`)
 * @returns A lazy route component compatible with TanStack Router
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/lazyRouteComponentFunction
 */
export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let loadPromise: (Promise<void> & { status?: 'fulfilled' }) | undefined
  let comp: T[TKey] | T['default']
  let error: any

  const load = () => {
    if (!loadPromise) {
      error = undefined
      loadPromise = importer()
        .then((res) => {
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
          // React's docs tell libraries to set `status`/`value` on a promise so
          // `use()` can read it synchronously ("How to implement a promise
          // cache", https://react.dev/reference/react/use#caching-promises-for-client-components).
          // An already loaded chunk then renders without suspending. Mark it in
          // the same tick that sets `comp`, so `use()` never sees a loaded chunk
          // as pending. `loadPromise` (this chain) is assigned before this runs
          // and settles a few microtasks later, with `undefined`, which `Lazy`
          // ignores.
          loadPromise!.status = 'fulfilled'
        })
        .catch((err) => {
          loadPromise = undefined
          // We don't want an error thrown from preload in this case, because
          // there's nothing we want to do about module not found during preload.
          // Record the error, the rest is handled during the render path.
          error = err
        })
    }

    return loadPromise
  }
  const lazyComp = function Lazy(props: any) {
    if (error) {
      // A missing module can mean that a newer deployment replaced the URL.
      // Reload only for the error that is still current at render time, so a
      // successful retry cannot leave a stale reload request armed.
      if (
        isModuleNotFoundError(error) &&
        !(isServer ?? typeof window === 'undefined') &&
        typeof sessionStorage !== 'undefined'
      ) {
        const storageKey = `tanstack_router_reload:${error.message}`
        if (!sessionStorage.getItem(storageKey)) {
          sessionStorage.setItem(storageKey, '1')
          window.location.reload()
          // Suspend forever while the document reloads.
          throw new Promise(() => {})
        }
      }
      throw error
    }

    // Call `use()` on every render, even once loaded, as React's pitfall
    // "Don't skip calling `use` based on whether a Promise is already settled"
    // requires (https://react.dev/reference/react/use#conditional-use). React
    // 19.3+ warns in development when a render that suspended in `use()`
    // finishes without calling it.
    if (reactUse) {
      reactUse(load())
    } else if (!comp) {
      throw load()
    }

    return React.createElement(comp, props)
  }

  ;(lazyComp as any).preload = load

  return lazyComp as any
}
