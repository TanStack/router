import * as React from 'react'
import { isModuleNotFoundError } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { reactUse } from './utils'
import type { LazyRouteComponentHot } from '@tanstack/router-core/hmr'
import type { AsyncRouteComponent } from './route'

type ReactLazyRouteComponentHot = LazyRouteComponentHot & {
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
}

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
      const promise = (loadPromise = importer()
        .then((res): any => {
          // A hot update replaced this load: settle with the newer one.
          if (
            process.env.NODE_ENV !== 'production' &&
            loadPromise !== promise
          ) {
            return loadPromise
          }
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            loadPromise = undefined
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
        })
        .catch((err): any => {
          if (
            process.env.NODE_ENV !== 'production' &&
            loadPromise !== promise
          ) {
            return loadPromise
          }
          loadPromise = undefined
          // We don't want an error thrown from preload in this case, because
          // there's nothing we want to do about module not found during preload.
          // Record the error, the rest is handled during the render path.
          error = err
        }))
    }

    return loadPromise
  }
  const lazyComp = function Lazy(props: any) {
    if (process.env.NODE_ENV !== 'production') {
      const hot: ReactLazyRouteComponentHot | undefined = (lazyComp as any)
        .__tsrHot
      if (hot) {
        // The slot exists on the client only and never changes, so the hook
        // order is stable. A hot swap re-renders through this subscription.
        // eslint-disable-next-line react-hooks/rules-of-hooks
        React.useSyncExternalStore(
          hot.subscribe,
          hot.getVersion,
          hot.getVersion,
        )
      }
    }

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

  if (
    process.env.NODE_ENV !== 'production' &&
    !(isServer ?? typeof window === 'undefined')
  ) {
    let version = 0
    const listeners = new Set<() => void>()
    const rerender = () => {
      version++
      listeners.forEach((listener) => listener())
    }
    const hot: ReactLazyRouteComponentHot = {
      importer,
      exportName: exportName as string | undefined,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getVersion: () => version,
      update: (nextImporter, nextExportName, keep) => {
        importer = nextImporter as () => Promise<T>
        exportName = nextExportName as TKey | undefined
        if (comp === undefined && loadPromise === undefined && !error) {
          // Never loaded: the next render loads through the new importer.
          return
        }
        const promise: Promise<any> = nextImporter().then(
          (res) => {
            if (loadPromise !== promise) {
              return loadPromise
            }
            loadPromise = undefined
            const next = res[nextExportName ?? 'default']
            // Keep: the refresh runtime patches the held component in place.
            if (comp === undefined || !keep(next, comp)) {
              comp = next
              error = undefined
              rerender()
            }
            return undefined
          },
          (err) => {
            if (loadPromise !== promise) {
              return loadPromise
            }
            loadPromise = undefined
            error = err
            rerender()
            return undefined
          },
        )
        loadPromise = promise
      },
    }
    ;(lazyComp as any).__tsrHot = hot
  }

  return lazyComp as any
}
