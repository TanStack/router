import * as Vue from 'vue'
import {
  clearModuleNotFoundReload,
  isModuleNotFoundError,
  shouldReloadForModuleNotFound,
} from '@tanstack/router-core'
import { Outlet } from './Match'
import { ClientOnly } from './ClientOnly'
import type { AsyncRouteComponent } from './route'

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
          // The module is present, so the deployment it belongs to is live and
          // it may spend a reload again if a later one leaves it stale.
          clearModuleNotFoundReload(importer)
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
  // Create a lazy component wrapper using defineComponent so it works in Vue SFC templates
  const lazyComp = Vue.defineComponent({
    name: 'LazyRouteComponent',
    setup(props: any) {
      // Create refs to track component state
      // Use shallowRef for component to avoid making it reactive (Vue warning)
      const component = Vue.shallowRef<any>(comp ? Vue.markRaw(comp) : comp)
      const errorState = Vue.ref<any>(error)
      const loading = Vue.ref(!component.value && !errorState.value)

      // Setup effect to load the component when this component is used
      Vue.onMounted(() => {
        if (!component.value && !errorState.value) {
          loading.value = true

          load()
            .then((result) => {
              // Use markRaw to prevent Vue from making the component reactive
              component.value = result ? Vue.markRaw(result) : result
              loading.value = false
            })
            .catch((err) => {
              errorState.value = err
              loading.value = false
            })
        }
      })

      // Handle module not found error with reload attempt
      if (
        errorState.value &&
        isModuleNotFoundError(errorState.value) &&
        !attemptedReload
      ) {
        // A missing module can mean that a newer deployment replaced the URL,
        // so reload once to pick the new build up.
        if (
          typeof window !== 'undefined' &&
          shouldReloadForModuleNotFound(importer)
        ) {
          attemptedReload = true
          window.location.reload()
          return () => null // Return empty while reloading
        }
      }

      // If we have a non-module-not-found error, throw it
      if (errorState.value && !isModuleNotFoundError(errorState.value)) {
        throw errorState.value
      }

      // Return a render function
      return () => {
        // If we're still loading or don't have a component yet, use a suspense pattern
        if (loading.value || !component.value) {
          return Vue.h('div', null) // Empty div while loading
        }

        // If SSR is disabled for this component
        if (ssr?.() === false) {
          return Vue.h(
            ClientOnly,
            {
              fallback: Vue.h(Outlet),
            },
            {
              default: () => Vue.h(component.value, props),
            },
          )
        }

        // Regular render with the loaded component
        return Vue.h(component.value, props)
      }
    },
  })

  // Add preload method
  lazyComp.preload = load

  return lazyComp as any
}
