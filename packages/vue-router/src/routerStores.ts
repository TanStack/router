import { batch, createStore } from '@tanstack/vue-store'
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
    /** Maps each pending routeId to true for quick lookup. */
    pendingRouteIds: RouterReadableStore<Record<string, boolean>>
  }
}

export const getStoreFactory: GetStoreConfig = (_opts) => {
  return {
    createMutableStore: createStore,
    createReadonlyStore: createStore,
    batch,
    init: (stores: RouterStores<AnyRoute>) => {
      // Single derived store: one reactive node that maps every active
      // routeId to its child's matchId. Depends only on matchesId +
      // the pool's routeId tags (which are set during reconciliation).
      // Outlet reads the map and then does a direct pool lookup.
      stores.childMatchIdByRouteId = createStore(() => {
        const ids = stores.matchesId.state
        const obj: Record<string, string> = {}
        for (let i = 0; i < ids.length - 1; i++) {
          const parentStore = stores.activeMatchStoresById.get(ids[i]!)
          if (parentStore?.routeId) {
            obj[parentStore.routeId] = ids[i + 1]!
          }
        }
        return obj
      })

      stores.pendingRouteIds = createStore(() => {
        const ids = stores.pendingMatchesId.state
        const obj: Record<string, boolean> = {}
        for (const id of ids) {
          const store = stores.pendingMatchStoresById.get(id)
          if (store?.routeId) {
            obj[store.routeId] = true
          }
        }
        return obj
      })
    },
  }
}
