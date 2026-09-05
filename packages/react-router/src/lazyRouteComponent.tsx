import * as React from 'react'
import {
  clearModuleNotFoundReload,
  isModuleNotFoundError,
  isModuleNotFoundReloadPending,
  shouldReloadForModuleNotFound,
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

  const load = () => {
    if (!loadPromise) {
      error = undefined
      loadPromise = importer()
        .then((res) => {
          // The module is present, so the deployment it belongs to is live and
          // we may reload again if a later deploy removes a chunk with the same
          // import name.
          clearModuleNotFoundReload(importer)
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            loadPromise = undefined
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
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
        !(isServer ?? typeof window === 'undefined')
      ) {
        if (shouldReloadForModuleNotFound(importer)) {
          window.location.reload()
          // Suspend forever while the document reloads.
          throw new Promise(() => {})
        }

        // The reload this document already started has not landed yet. Keep
        // suspending, so a render in that window cannot flash an error screen
        // that the incoming document is about to replace.
        if (isModuleNotFoundReloadPending()) {
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
