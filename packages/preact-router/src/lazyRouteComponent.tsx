import { h } from 'preact'
import { isModuleNotFoundError } from '@tanstack/router-core'
import type { AsyncRouteComponent } from './route'

/**
 * Wrap a dynamic import to create a route component that supports
 * `.preload()` and friendly reload-on-module-missing behavior.
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
  let reload: boolean

  const load = () => {
    if (!loadPromise) {
      loadPromise = importer()
        .then((res) => {
          loadPromise = undefined
          comp = res[exportName ?? 'default']
        })
        .catch((err) => {
          error = err
          if (isModuleNotFoundError(error)) {
            if (
              error instanceof Error &&
              typeof window !== 'undefined' &&
              typeof sessionStorage !== 'undefined'
            ) {
              const storageKey = `tanstack_router_reload:${error.message}`
              if (!sessionStorage.getItem(storageKey)) {
                sessionStorage.setItem(storageKey, '1')
                reload = true
              }
            }
          }
        })
    }

    return loadPromise
  }

  const lazyComp = function Lazy(props: any) {
    if (reload) {
      window.location.reload()
      throw new Promise(() => {})
    }
    if (error) {
      throw error
    }

    if (!comp) {
      throw load()
    }

    return h(comp as any, props)
  }

  ;(lazyComp as any).preload = load

  return lazyComp as any
}
