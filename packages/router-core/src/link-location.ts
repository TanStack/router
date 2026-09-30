import { isServer } from '@tanstack/router-core/isServer'
import { removeTrailingSlash } from './path'
import type { ParsedLocation } from './location'
import type { AnyRouter } from './router'

type Subscription = { unsubscribe: () => void }
type LocationSource = {
  get: () => ParsedLocation
  subscribe: (listener: () => void) => Subscription
}
type Listener = [notify: (() => void) | undefined, owner: string | undefined]
type Registry = {
  paths: Map<string, Set<Listener>>
  deferred: Set<Listener>
  subscription: Subscription
}

// The existing builder cache proves independence from the current location.
// Keying by its generation lets configuration changes conservatively fall back
// to a broadcast until the old subscriptions are disposed.
const registries = new WeakMap<object, Registry>()

/**
 * Narrow notifications, not snapshots or Link computations. React still reads
 * the authoritative location during render and owns derivation/error handling.
 * Source-dependent destinations retain the ordinary live subscription.
 * @internal
 */
export function getLinkLocationStore(
  router: AnyRouter,
  options: object,
  owner: string | undefined,
): { get: () => ParsedLocation; subscribe: (notify: () => void) => () => void } {
  // Only the React adapter calls this bridge. Core's framework-neutral store
  // contract intentionally omits the adapter's subscription API.
  const source = router.stores.location as unknown as LocationSource
  return {
    get: source.get,
    subscribe: (notify) => {
      if (isServer ?? router.isServer) {
        return () => {}
      }
      // React reads the snapshot before subscribing, populating this cache.
      const cache: WeakMap<object, ParsedLocation> | undefined =
        router['staticLocations']
      const next = cache?.get(options)
      if (!next) {
        return source.subscribe(notify).unsubscribe
      }
      let registry = registries.get(cache!)
      if (!registry) {
        const paths = new Map<string, Set<Listener>>()
        const deferred = new Set<Listener>()
        let previous = source.get()
        let hrefSource = router.history._hrefSource?.[1]()
        let waiting: AnyRouter['_tx']
        const publish = (settled?: AnyRouter['_tx']) => {
          if (settled) {
            if (waiting === settled) {
              waiting = undefined
            }
            if (router._tx !== settled) {
              return
            }
          }
          const location = source.get()
          const tx = router._tx
          const formatting = router.history._hrefSource
          const nextHrefSource = formatting?.[1]()
          const broadcast =
            cache !== router['staticLocations'] ||
            !formatting ||
            formatting[0] !== router.history.createHref ||
            nextHrefSource !== hrefSource
          const candidates = new Set(deferred)
          if (!settled) {
            const add = (group: Set<Listener>) => {
              group.forEach((listener) => candidates.add(listener))
            }
            if (broadcast) {
              paths.forEach(add)
            } else {
              for (const current of [previous, location]) {
                let path = removeTrailingSlash(current.pathname, router.basepath)
                for (;;) {
                  const group = paths.get(path)
                  if (group) {
                    add(group)
                  }
                  const slash = path.lastIndexOf('/')
                  if (slash <= 0) {
                    break
                  }
                  path = path.slice(0, slash)
                }
              }
            }
            // Install the source before any notification can reenter.
            previous = location
            hrefSource = nextHrefSource
          }
          for (const listener of candidates) {
            if (!listener[0]) {
              continue
            }
            if (
              !settled &&
              !broadcast &&
              router._tx === tx &&
              source.get() === location &&
              router.stores.status.get() === 'pending' &&
              tx?.[2] === location &&
              listener[1] &&
              !tx[3].some((match) => match.routeId === listener[1])
            ) {
              deferred.add(listener)
              if (waiting !== tx) {
                waiting = tx
                const finish = publish.bind(null, tx)
                tx[5].then(finish, finish)
              }
            } else {
              deferred.delete(listener)
              // Read the latest location even after a sibling reenters. Do not
              // abandon old-path deactivations missing from the successor's set.
              listener[0]()
            }
          }
        }
        registry = {
          paths,
          deferred,
          subscription: source.subscribe(() => publish()),
        }
        registries.set(cache!, registry)
      }
      const path = removeTrailingSlash(next.pathname, router.basepath)
      let group = registry.paths.get(path)
      if (!group) {
        registry.paths.set(path, (group = new Set()))
      }
      const listener: Listener = [notify, owner]
      group.add(listener)
      return () => {
        listener[0] = undefined
        group.delete(listener)
        registry.deferred.delete(listener)
        if (!group.size) {
          registry.paths.delete(path)
        }
        if (!registry.paths.size) {
          registry.subscription.unsubscribe()
          registries.delete(cache!)
        }
      }
    },
  }
}
