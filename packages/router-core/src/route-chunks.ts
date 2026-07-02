import type { AnyRoute } from './route'

type RouteComponentType =
  | 'component'
  | 'errorComponent'
  | 'pendingComponent'
  | 'notFoundComponent'

function preloadComponent(component: any): Promise<void> | undefined {
  try {
    return component?.preload?.()
  } catch (error) {
    return Promise.reject(error)
  }
}

function preloadRouteComponents(
  route: AnyRoute,
): Promise<Array<void>> | undefined {
  let preloads: Array<Promise<void>> | undefined
  for (const componentType of componentTypes) {
    const preload = preloadComponent(route.options[componentType])
    if (preload) {
      ;(preloads ||= []).push(preload)
    }
  }

  return preloads && Promise.all(preloads)
}

export function loadRouteChunk(
  route: AnyRoute,
  componentType?: RouteComponentType,
) {
  if (!route._lazyLoaded && !route._lazyPromise) {
    if (route.lazyFn) {
      try {
        route._lazyPromise = route.lazyFn().then((lazyRoute) => {
          // explicitly don't copy over the lazy route's id
          const { id: _id, ...options } = lazyRoute.options
          Object.assign(route.options, options)
          route._lazyLoaded = true
          route._lazyPromise = undefined // gc promise, we won't need it anymore
        })
      } catch (error) {
        route._lazyPromise = Promise.reject(error)
      }
    } else {
      route._lazyLoaded = true
    }
  }

  const runAfterLazy = () => {
    if (route._componentsLoaded) {
      return
    }
    if (componentType) {
      return (
        route._componentsPromise ||
        preloadComponent(route.options[componentType])
      )
    }
    if (!route._componentsPromise) {
      const componentsPromise = preloadRouteComponents(route)

      if (componentsPromise) {
        route._componentsPromise = componentsPromise.then(() => {
          route._componentsLoaded = true
          route._componentsPromise = undefined // gc promise, we won't need it anymore
        })
      } else {
        route._componentsLoaded = true
      }
    }
    return route._componentsPromise
  }

  return route._lazyPromise
    ? route._lazyPromise.then(runAfterLazy)
    : runAfterLazy()
}

export function routeNeedsPreload(route: AnyRoute) {
  for (const componentType of componentTypes) {
    if ((route.options[componentType] as any)?.preload) {
      return true
    }
  }
  return false
}

const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const satisfies ReadonlyArray<RouteComponentType>
