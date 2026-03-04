import { batch, createVueMutableStore, createVueReadonlyStore } from './store'
import type {
  AnyRoute,
  GetStoreConfig,
  RouterReadableStore,
  RouterStores,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouterStores<in out TRouteTree extends AnyRoute> {
    lastMatchRouteFullPath: RouterReadableStore<string | undefined>
    /** Maps each active routeId to the matchId of its child in the match tree. */
    childMatchIdByRouteId: RouterReadableStore<Record<string, string>>
    /** Maps each pending routeId to true for quick lookup. */
    pendingRouteIds: RouterReadableStore<Record<string, boolean>>
  }
}

export const getStoreFactory: GetStoreConfig = (_opts) => {
  return {
    createMutableStore: createVueMutableStore,
    createReadonlyStore: createVueReadonlyStore,
    batch,
    init: (stores: RouterStores<AnyRoute>) => {
      stores.lastMatchRouteFullPath = createVueReadonlyStore(() => {
        const id = stores.lastMatchId.state
        if (!id) {
          return undefined
        }
        return stores.activeMatchStoresById.get(id)?.state.fullPath
      })

      // Single derived store: one reactive node that maps every active
      // routeId to its child's matchId. Depends only on matchesId +
      // the pool's routeId tags (which are set during reconciliation).
      // Outlet reads the map and then does a direct pool lookup.
      stores.childMatchIdByRouteId = createVueReadonlyStore(() => {
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

      stores.pendingRouteIds = createVueReadonlyStore(() => {
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
