import * as React from 'react'
import {
  isModuleNotFoundError,
  waitForPageToStay,
  watchPageUnload,
} from '@tanstack/router-core'
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
  let loadPromise: Promise<any> | undefined
  let comp: T[TKey] | T['default']
  let error: any
  let cancelledByUnload = false
  let staying: Promise<void> | undefined

  const load = () => {
    if (!loadPromise) {
      error = undefined
      cancelledByUnload = false
      const stopWatchingUnload = watchPageUnload()
      loadPromise = importer()
        .then((res) => {
          stopWatchingUnload()
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            loadPromise = undefined
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
        })
        .catch((err) => {
          loadPromise = undefined
          cancelledByUnload = stopWatchingUnload() && isModuleNotFoundError(err)
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
      // The browser cancelled the import because the page is unloading, so a
      // reload would replace the navigation the user started. If the page
      // stays after all, retry the import instead.
      if (cancelledByUnload) {
        staying ??= waitForPageToStay().then(() => {
          staying = undefined
          error = undefined
          cancelledByUnload = false
        })
        throw staying
      }
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

    if (!comp) {
      if (reactUse) {
        reactUse(load())
      } else {
        throw load()
      }
    }

    return React.createElement(comp, props)
  }

  ;(lazyComp as any).preload = load

  return lazyComp as any
}
