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

/**
 * Preloads one component type with per-type in-flight tracking.
 *
 * A targeted request (`join: true`, e.g. the errorComponent for a failing
 * route) joins that type's in-flight chunk instead of starting a duplicate —
 * but never waits on any other type's chunk. A full route preload
 * (`join: false`) always starts fresh and overwrites stale entries so a new
 * load generation cannot get coupled to an older generation's boundary
 * chunk. Settled preloads — success or failure — leave the cache: repeats
 * are the component's own concern (lazy components memoize their import),
 * and a rejection is never replayed forever.
 */
function preloadRouteComponent(
  route: AnyRoute,
  componentType: RouteComponentType,
  join: boolean,
): Promise<void> | undefined {
  const cache = (route._componentPromises ||= {})
  if (join) {
    const inFlight = cache[componentType]
    if (inFlight) {
      return inFlight
    }
  }

  const preload = preloadComponent(route.options[componentType])
  if (!preload) {
    delete cache[componentType]
    return undefined
  }

  // Cache and return the raw preload so awaiting callers observe settlement
  // without an extra microtask hop; the cleanup chain is bookkeeping only
  // and swallows the rejection it observes (awaiters own the real one).
  cache[componentType] = preload
  const cleanup = () => {
    if (cache[componentType] === preload) {
      delete cache[componentType]
    }
  }
  void preload.then(cleanup, cleanup)
  return preload
}

function preloadRouteComponents(
  route: AnyRoute,
): Promise<Array<void>> | undefined {
  let preloads: Array<Promise<void>> | undefined
  for (const componentType of componentTypes) {
    const preload = preloadRouteComponent(route, componentType, false)
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

      // A rejected lazy chunk must not be replayed forever: evict it so the
      // next load generation retries the import, like component chunk
      // preloads. Awaiters of the evicted promise still own the rejection.
      const lazyPromise = route._lazyPromise
      if (lazyPromise) {
        void lazyPromise.then(null, () => {
          if (route._lazyPromise === lazyPromise) {
            route._lazyPromise = undefined
          }
        })
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
      // A targeted request (e.g. the errorComponent for a failing route)
      // must only depend on that component's own chunk — never on the
      // whole-route preload, whose unrelated (possibly slow or failed)
      // component chunks would otherwise block or poison boundary UI.
      return preloadRouteComponent(route, componentType, true)
    }
    if (!route._componentsPromise) {
      const componentsPromise = preloadRouteComponents(route)

      if (componentsPromise) {
        route._componentsPromise = componentsPromise.then(
          () => {
            route._componentsLoaded = true
            route._componentsPromise = undefined // gc promise, we won't need it anymore
          },
          (error) => {
            // Clear so a later pass can retry the failed component types;
            // successful types stay marked done in the per-type cache.
            route._componentsPromise = undefined
            throw error
          },
        )
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
