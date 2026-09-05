import { Dynamic } from 'solid-js/web'
import { createResource } from 'solid-js'
import {
  clearModuleNotFoundReload,
  isModuleNotFoundError,
  isModuleNotFoundReloadPending,
  shouldReloadForModuleNotFound,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
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
  let loadPromise: Promise<any> | undefined
  let comp: T[TKey] | T['default']
  let error: any

  const load = () => {
    if (!loadPromise) {
      error = undefined
      loadPromise = importer()
        .then((res) => {
          // The module is present, so the deployment it belongs to is live and
          // it may spend a reload again if a later one leaves it stale.
          clearModuleNotFoundReload(importer)
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            loadPromise = undefined
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
          return comp
        })
        .catch((err) => {
          loadPromise = undefined
          error = err
        })
    }

    return loadPromise
  }
  const lazyComp = function Lazy(props: any) {
    // Now that we're out of preload and into actual render path,
    // throw the error if it was a module not found error during preload
    if (error) {
      // If the load fails due to module not found, it may mean a new version of
      // the build was deployed and the user's browser is still using an old version.
      // If this happens, the old version in the user's browser would have an outdated
      // URL to the lazy module.
      // In that case, we want to attempt one window refresh to get the latest.
      if (isModuleNotFoundError(error)) {
        // We don't want an error thrown from preload in this case, because
        // there's nothing we want to do about module not found during preload.
        // Record the error, recover the promise with a null return,
        // and we will attempt module not found resolution during the render path.

        // Again, we want to reload one time on module not found error and not enter
        // a reload loop if there is some other issue besides an old deploy.
        // That's why we store our reload attempt in sessionStorage.
        if (error instanceof Error && typeof window !== 'undefined') {
          if (shouldReloadForModuleNotFound(importer)) {
            window.location.reload()

            // Return empty component while we wait for window to reload
            return {
              default: () => null,
            }
          }

          // The reload this document already started has not landed yet. Stay
          // empty, so a render in that window cannot surface an error that the
          // incoming document is about to replace.
          if (isModuleNotFoundReloadPending()) {
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
      const [compResource] = createResource(load, {
        initialValue: comp,
        ssrLoadFrom: 'initial',
      })
      return <Dynamic component={compResource()} {...props} />
    }

    return <Dynamic component={comp} {...props} />
  }

  ;(lazyComp as any).preload = load

  return lazyComp as any
}
