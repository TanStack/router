// Code-split a route's component: wrap a dynamic import as a component that suspends
// (via octane's `use`) until the module loads, then renders it. Carries `.preload()`
// for hover/intent preloading, and reloads the page once on a stale-chunk
// module-not-found error (the same recovery react-router does).
//
//   createRoute({ path: 'item/$id', component: lazyRouteComponent(() => import('./Item')) })
import { createElement, use } from 'octane'
import { isModuleNotFoundError } from '@tanstack/router-core'
import { toExternalHydrationThenable } from './externalHydration'
import type { ComponentBody } from 'octane'
import type { AsyncRouteComponent } from './frameworkTypes'

export function lazyRouteComponent<
  T extends Record<string, unknown>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends ComponentBody<infer TProps>
  ? AsyncRouteComponent<TProps>
  : never
export function lazyRouteComponent(
  importer: () => Promise<any>,
  exportName?: string,
): AsyncRouteComponent<Record<string, unknown>> {
  let loadPromise: Promise<void> | undefined
  let comp: ComponentBody<Record<string, unknown>> | undefined
  let error: unknown
  let reload = false

  const load = () => {
    if (!loadPromise) {
      loadPromise = importer()
        .then((res) => {
          loadPromise = undefined
          comp = res[exportName ?? 'default'] as ComponentBody<
            Record<string, unknown>
          >
        })
        .catch((err) => {
          error = err
          if (
            isModuleNotFoundError(error) &&
            error instanceof Error &&
            typeof window !== 'undefined' &&
            typeof sessionStorage !== 'undefined'
          ) {
            const key = `tanstack_router_reload:${error.message}`
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, '1')
              reload = true
            }
          }
        })
    }
    return loadPromise
  }

  const Lazy: AsyncRouteComponent<Record<string, unknown>> = (props) => {
    if (reload) {
      window.location.reload()
      throw new Promise(() => {})
    }
    if (error) {
      throw error
    }
    if (!comp) {
      use(toExternalHydrationThenable(load()))
    }
    return createElement(comp!, props)
  }
  Lazy.preload = load
  return Lazy
}
