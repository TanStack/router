import * as Vue from 'vue'
import { isModuleNotFoundError } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
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
  let loadPromise: Promise<void> | undefined
  let comp: T[TKey] | T['default'] | null = null
  let error: any = null

  const load = () => {
    // If we're on the server and SSR is disabled for this component
    if ((isServer ?? typeof document === 'undefined') && ssr?.() === false) {
      comp = (() => null) as any
      return Promise.resolve()
    }

    if (loadPromise) {
      return loadPromise
    }

    error = null
    return (loadPromise = importer()
      .then((res) => {
        loadPromise = undefined
        comp = res[exportName ?? 'default']
      })
      .catch((err) => {
        error = err
        loadPromise = undefined

        // Missing modules are handled when the component renders.
        if (!isModuleNotFoundError(err)) {
          throw err
        }
      }))
  }

  // Create a lazy component wrapper using defineComponent so it works in Vue SFC templates
  const lazyComp = Vue.defineComponent({
    name: 'LazyRouteComponent',
    setup(props: any) {
      // Create refs to track component state
      const component = Vue.shallowRef<any>(comp)
      const errorState = Vue.ref<any>(error)

      // Setup effect to load the component when this component is used
      Vue.onMounted(() => {
        if (!component.value && !errorState.value) {
          load()
            .then(() => {
              errorState.value = error
              component.value = comp
            })
            .catch((err) => {
              errorState.value = err
            })
        }
      })

      // Return a render function
      return () => {
        if (errorState.value) {
          if (
            isModuleNotFoundError(errorState.value) &&
            !(isServer ?? typeof window === 'undefined') &&
            typeof sessionStorage !== 'undefined'
          ) {
            const storageKey = `tanstack_router_reload:${errorState.value.message}`
            if (!sessionStorage.getItem(storageKey)) {
              sessionStorage.setItem(storageKey, '1')
              window.location.reload()
              return null
            }
          }
          throw errorState.value
        }

        // If we're still loading or don't have a component yet, use a suspense pattern
        if (!component.value) {
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
