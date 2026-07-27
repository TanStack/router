import { Dynamic } from 'solid-js/web'
import { createResource } from 'solid-js'
import { isModuleNotFoundError } from '@tanstack/router-core'
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
  let loadPromise: Promise<void> | undefined
  let comp: T[TKey] | T['default']
  let error: any

  const load = () => {
    if (loadPromise) {
      return loadPromise
    }

    error = undefined
    return (loadPromise = importer()
      .then((res) => {
        // Keep browser preload behavior unchanged; SSR can reuse the import.
        if (
          !((isServer as boolean | undefined) ?? typeof window === 'undefined')
        ) {
          loadPromise = undefined
        }
        comp = res[exportName ?? 'default']
      })
      .catch((err) => {
        loadPromise = undefined
        error = err

        if (!isModuleNotFoundError(err)) {
          throw err
        }
      }))
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
      if (
        isModuleNotFoundError(error) &&
        error instanceof Error &&
        !((isServer as boolean | undefined) ?? typeof window === 'undefined') &&
        typeof sessionStorage !== 'undefined'
      ) {
        const storageKey = `tanstack_router_reload:${error.message}`
        if (!sessionStorage.getItem(storageKey)) {
          sessionStorage.setItem(storageKey, '1')
          window.location.reload()
          return {
            default: () => null,
          }
        }
      }

      // Otherwise, just throw the error
      throw error
    }

    if (!comp) {
      const [compResource] = createResource(() => load().then(() => comp), {
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
