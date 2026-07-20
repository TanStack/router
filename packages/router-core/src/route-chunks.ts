import type { AnyRoute } from './route'

type RouteComponentType =
  | 'component'
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export function replaceRouteChunk(
  route: AnyRoute,
  lazyFn: AnyRoute['lazyFn'],
): void {
  route.lazyFn = lazyFn ?? route.lazyFn
  route._lazy = undefined
}

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
  // `false` waits only for lazy route options, before a boundary is selected.
  componentType?: 'errorComponent' | 'notFoundComponent' | false,
): Promise<void> | undefined {
  const afterLazy = () =>
    componentType === false
      ? undefined
      : componentType
        ? preloadComponent(route, componentType)
        : loadComponents(route)
  const current = route._lazy
  if (current) {
    return current === true ? afterLazy() : current.then(afterLazy)
  }
  if (!route.lazyFn) {
    return afterLazy()
  }

  const promise = route.lazyFn().then(
    (lazyRoute) => {
      // HMR clears the owner before an obsolete import can settle.
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazy = true
      }
    },
    (error) => {
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        route._lazy = undefined
      }
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}
