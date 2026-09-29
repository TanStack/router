import { isServer } from '@tanstack/router-core/isServer'
import { functionalUpdate } from './utils'
import type { AnyRouter } from './router'
import type { ParsedLocation } from './location'
import type { MutableStoreFactory, RouterReadableStore } from './stores'

/**
 * Share active-state publications by owning route, without owning Link
 * derivation or subscriptions. Destinations and history formatting stay live.
 * @internal
 */
export function getLinkLocationStore(
  router: AnyRouter,
  routeId: string | undefined,
  createMutableStore: MutableStoreFactory,
): RouterReadableStore<ParsedLocation> {
  const { location, status } = router.stores
  const batch = router.batch
  let linkLocations = router.stores._linkLocations
  if (isServer ?? router.isServer) {
    return location
  }
  if (!routeId) {
    return location
  }
  if (!linkLocations) {
    linkLocations = router.stores._linkLocations = new Map()
    let waiting: AnyRouter['_tx']
    const setLocation = location.set
    const publish = (settled?: AnyRouter['_tx']) => {
      if (settled) {
        if (waiting === settled) {
          waiting = undefined
        }
        if (router._tx !== settled) {
          return
        }
      }
      const current = location.get()
      const tx = router._tx
      const pending =
        !settled && status.get() === 'pending' && tx?.[2] === current
          ? tx
          : undefined
      // A publication has its own identity, even when cancellation restores
      // the same location object. Render-local active selectors can then
      // discard the live-location baseline captured by a prop change.
      const snapshot = { ...current }
      batch(() => {
        let deferred = false
        for (const [id, source] of linkLocations!) {
          if (pending && !pending[3].some((match) => match.routeId === id)) {
            deferred = true
          } else {
            source.set(snapshot)
          }
        }
        if (deferred && waiting !== pending) {
          waiting = pending
          // Do not chain delivery failures into the navigation's promise.
          // Bind only the transaction, not a departing location or its Links.
          const finish = publish.bind(null, pending)
          pending![5].then(finish, finish)
        }
      })
    }
    location.set = (next) => {
      batch(() => {
        setLocation(functionalUpdate(next, location.get()))
        publish()
      })
    }
  }
  let source = linkLocations.get(routeId)
  if (!source) {
    source = createMutableStore<ParsedLocation>({ ...location.get() })
    linkLocations.set(routeId, source)
  }
  return source
}
