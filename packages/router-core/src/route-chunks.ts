import type { AnyRoute } from './route'

type RouteComponentType =
  | 'component'
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

function preloadComponent(
  route: AnyRoute,
  type: RouteComponentType,
): Promise<void> | undefined {
  return (route.options[type] as any)?.preload?.()
}

function loadComponents(route: AnyRoute): Promise<void> | undefined {
  const component = preloadComponent(route, 'component')
  const pending = preloadComponent(route, 'pendingComponent')
  if (component && pending) {
    return Promise.all([component, pending]).then(() => {})
  }
  return component ?? pending
}

export function loadRouteChunk(
  route: AnyRoute,
  componentType?: 'errorComponent' | 'notFoundComponent',
): Promise<void> | undefined {
  const afterLazy = () =>
    componentType
      ? preloadComponent(route, componentType)
      : loadComponents(route)

  const current = route._lazy
  if (current) {
    return current === true ? afterLazy() : current.then(afterLazy)
  }
  if (!route.lazyFn) {
    route._lazy = true
    return afterLazy()
  }

  const promise = route.lazyFn().then(
    (lazyRoute) => {
      // HMR clears the owner before an obsolete import can settle.
      if (route._lazy === promise) {
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazy = true
      }
    },
    (error) => {
      if (route._lazy === promise) {
        route._lazy = undefined
      }
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}

export function routeNeedsPreload(route: AnyRoute): boolean {
  return !!(
    (route.options.component as any)?.preload ||
    (route.options.pendingComponent as any)?.preload
  )
}
