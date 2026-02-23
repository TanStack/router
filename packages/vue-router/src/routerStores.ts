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
    },
  }
}
