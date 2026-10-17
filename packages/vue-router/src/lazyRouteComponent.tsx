import * as Vue from 'vue'
import { Outlet } from './Match'
import { ClientOnly } from './ClientOnly'
import type { AsyncRouteComponent } from './route'

// If the load fails due to module not found, it may mean a new version of
// the build was deployed and the user's browser is still using an old version.
// If this happens, the old version in the user's browser would have an outdated
// URL to the lazy module.
// In that case, we want to attempt one window refresh to get the latest.
function isModuleNotFoundError(error: any): boolean {
  // chrome: "Failed to fetch dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // firefox: "error loading dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split"
  // safari: "Importing a module script failed."
  if (typeof error?.message !== 'string') return false
  return (
    error.message.startsWith('Failed to fetch dynamically imported module') ||
    error.message.startsWith('error loading dynamically imported module') ||
    error.message.startsWith('Importing a module script failed')
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
  let comp: T[TKey] | T['default'] | null = null
  let error: any = null
  let attemptedReload = false

  const load = () => {
    // If we're on the server and SSR is disabled for this component
    if (typeof document === 'undefined' && ssr?.() === false) {
      comp = (() => null) as any
      return Promise.resolve(comp)
    }

    // Use existing promise or create new one
    if (!loadPromise) {
      error = undefined
      loadPromise = importer()
        .then((res) => {
          if (typeof document !== 'undefined') {
            loadPromise = undefined
            ;(lazyComp as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
          return comp
        })
        .catch((err) => {
          error = err
          loadPromise = undefined

          // If it's a module not found error, we'll try to handle it in the component
          if (isModuleNotFoundError(error)) {
            return null
          }

          throw err
        })
    }

    return loadPromise
  }
  // Reload once per missing module URL: a newer deployment may have replaced it.
  const reloadOnce = () => {
    if (
      isModuleNotFoundError(error) &&
      !attemptedReload &&
      typeof sessionStorage !== 'undefined'
    ) {
      const storageKey = `tanstack_router_reload:${error.message}`
      if (!sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, '1')
        attemptedReload = true
        window.location.reload()
        return true
      }
    }
    return false
  }

  // Vue (>= 3.3) hydrates an unresolved async component only once its loader
  // settles, so the server HTML stays in place while the chunk downloads.
  const AsyncComp = Vue.defineAsyncComponent(() =>
    load().then(() => {
      if (error) {
        if (reloadOnce()) {
          return new Promise<never>(() => {})
        }
        throw error
      }
      return comp as any
    }),
  )

  const lazyComp = Vue.defineComponent({
    name: 'LazyRouteComponent',
    setup(props: any) {
      if (error && !comp) {
        if (reloadOnce()) {
          return () => null
        }
        throw error
      }
      const resolved = comp ? Vue.markRaw(comp) : null
      return () => {
        const inner = Vue.h(resolved ?? AsyncComp, props)
        if (ssr?.() === false) {
          return Vue.h(
            ClientOnly,
            { fallback: Vue.h(Outlet) },
            { default: () => inner },
          )
        }
        return inner
      }
    },
  })

  // Add preload method
  lazyComp.preload = load

  return lazyComp as any
}
