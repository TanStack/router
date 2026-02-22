import { batch, createStore } from '@tanstack/vue-store'
import type { Readable } from '@tanstack/vue-store'
import type { AnyRoute, GetStoreConfig, RouterStores } from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> { }
  // eslint-disable-next-line unused-imports/no-unused-vars
  export interface RouterStores<in out TRouteTree extends AnyRoute> {
    lastMatchRouteFullPath: RouterReadableStore<string | undefined>
  }
}
export const getStoreFactory: GetStoreConfig = (opts) => {
  return {
    createMutableStore: createStore,
    createReadonlyStore: createStore,
    batch: batch,
    init: (stores: RouterStores<AnyRoute>) => {
      stores.lastMatchRouteFullPath = createStore(() => {
        const id = stores.lastMatchId.state
        if (!id) {
          return undefined
        }
        return stores.activeMatchStoresById.get(id)?.state.fullPath
      })
    }
  }
}