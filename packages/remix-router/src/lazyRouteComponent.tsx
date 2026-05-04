/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { isModuleNotFoundError } from '@tanstack/router-core'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { RemixRouteComponent } from './extensions'

interface LazyComponentExtras {
  preload: () => Promise<void>
}

type AnyComp = RemixRouteComponent | ((handle: Handle<any, any>) => any)

/**
 * Wrap a dynamic import as a route component. Mirrors
 * `lazyRouteComponent` from `@tanstack/react-router`. The returned function
 * is a `remix/ui` factory, so it plugs into `route.options.component`
 * directly. Calling `.preload()` on the returned function eagerly loads the
 * module — `router.preloadRoute()` will use this automatically.
 */
export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): AnyComp & LazyComponentExtras {
  let loadPromise: Promise<any> | undefined
  let comp: AnyComp | undefined
  let error: any
  let reload = false

  const load = () => {
    if (!loadPromise) {
      loadPromise = importer()
        .then((res) => {
          loadPromise = undefined
          comp = res[(exportName ?? 'default') as keyof T] as AnyComp
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
    return loadPromise as Promise<void>
  }

  const lazy = function Lazy(handle: Handle<any, any>) {
    if (!comp && !error) {
      // Kick the import on the first render. Re-render once it lands.
      void load().then(() => handle.update())
    }
    return (props: any): RemixNode => {
      if (reload) {
        if (typeof window !== 'undefined') window.location.reload()
        return null
      }
      if (error) throw error
      if (!comp) return null
      // `comp` may itself be a remix/ui factory or a render function — in
      // both cases JSX evaluates them properly.
      const Comp = comp as any
      return <Comp {...props} />
    }
  } as AnyComp & LazyComponentExtras

  lazy.preload = load
  return lazy
}
