import { batch, createAtom } from '@tanstack/vue-store'
import type {
  AnyRoute,
  GetStoreConfig,
  RouterStores,
} from '@tanstack/router-core'
import type { Readable } from '@tanstack/vue-store'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> {}
  export interface RouterStores<in out TRouteTree extends AnyRoute> {
    /** Maps each active routeId to the matchId of its child in the match tree. */
    childMatchIdByRouteId: RouterReadableStore<Record<string, string>>
  }
}

export const getStoreFactory: GetStoreConfig = (_opts) => {
  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
    init: (stores: RouterStores<AnyRoute>) => {
      // Single derived store: one reactive node that maps every active
      // routeId to its child's matchId. Depends only on matchesId +
      // the pool's routeId tags (which are set during reconciliation).
      // Outlet reads the map and then does a direct pool lookup.
      stores.childMatchIdByRouteId = createAtom(() => {
        const ids = stores.matchesId.get()
        const obj: Record<string, string> = {}
        for (let i = 0; i < ids.length - 1; i++) {
          const parentStore = stores.matchStores.get(ids[i]!)
          if (parentStore?.routeId) {
            obj[parentStore.routeId] = ids[i + 1]!
          }
        }
        return obj
      })
    },
  }
}
