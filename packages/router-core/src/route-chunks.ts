import type { AnyRoute } from './route'

type RouteComponentType =
  | 'component'
  | 'errorComponent'
  | 'pendingComponent'
  | 'notFoundComponent'

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

  let preload: Promise<void> | undefined
  try {
    preload = (route.options[componentType] as any)?.preload?.()
  } catch (error) {
    preload = Promise.reject(error)
  }
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

export function loadRouteChunk(
  route: AnyRoute,
  componentType?: RouteComponentType,
) {
  if (!route._lazyLoaded && !route._lazyPromise) {
    if (route.lazyFn) {
      let lazyGeneration: number | undefined
      if (process.env.NODE_ENV !== 'production') {
        lazyGeneration = (route._lazyGeneration ?? 0) + 1
        route._lazyGeneration = lazyGeneration
      }
      try {
        const lazyPromise = (route._lazyPromise = route
          .lazyFn()
          .then((lazyRoute) => {
            // HMR can retire an in-flight lazy generation by clearing the
            // route-level promise. A late result from that generation must not
            // overwrite the new route options or mark the replacement loaded.
            if (
              process.env.NODE_ENV !== 'production' &&
              (route._lazyGeneration !== lazyGeneration ||
                route._lazyPromise !== lazyPromise)
            ) {
              return
            }
            // explicitly don't copy over the lazy route's id
            const { id: _id, ...options } = lazyRoute.options
            Object.assign(route.options, options)
            route._lazyLoaded = true
            route._lazyPromise = undefined // gc promise, we won't need it anymore
          }))
      } catch (error) {
        route._lazyPromise = Promise.reject(error)
      }

      // A rejected lazy chunk must not be replayed forever: evict it so the
      // next load generation retries the import, like component chunk
      // preloads. Awaiters of the evicted promise still own the rejection.
      const lazyPromise = route._lazyPromise
      void lazyPromise.catch(() => {
        if (route._lazyPromise === lazyPromise) {
          route._lazyPromise = undefined
        }
      })
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
      let preloads: Array<Promise<void>> | undefined
      for (const type of componentTypes) {
        const preload = preloadRouteComponent(route, type, false)
        if (preload) {
          ;(preloads ||= []).push(preload)
        }
      }
      const componentsPromise = preloads && Promise.all(preloads)

      if (componentsPromise) {
        const trackedPromise = (route._componentsPromise =
          componentsPromise.then(
            () => {
              // HMR can replace the route-level preload generation while its
              // old component promises are still settling. Only the generation
              // still registered on the route may publish completion.
              if (
                process.env.NODE_ENV !== 'production' &&
                route._componentsPromise !== trackedPromise
              ) {
                return
              }
              route._componentsLoaded = true
              route._componentsPromise = undefined // gc promise, we won't need it anymore
            },
            (error) => {
              // Clear so a later pass can retry the failed component types;
              // successful types stay marked done in the per-type cache.
              if (
                process.env.NODE_ENV === 'production' ||
                route._componentsPromise === trackedPromise
              ) {
                route._componentsPromise = undefined
              }
              throw error
            },
          ))
      } else {
        route._componentsLoaded = true
      }
    }
    return route._componentsPromise
  }

  const lazyPromise = route._lazyPromise
  const lazyGeneration =
    process.env.NODE_ENV !== 'production'
      ? route._lazyGeneration
      : undefined
  return lazyPromise
    ? lazyPromise.then(() => {
        // A retired lazy generation may still resolve after HMR installed a
        // replacement promise. Do not let its caller start component work
        // from the stale route options. If the replacement already finished,
        // runAfterLazy only joins or observes that current component work.
        if (
          (process.env.NODE_ENV === 'production' ||
            route._lazyGeneration === lazyGeneration) &&
          route._lazyLoaded &&
          !route._lazyPromise
        ) {
          return runAfterLazy()
        }
        return undefined
      })
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
