import { batch, createStore } from '@tanstack/react-store'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { Readable } from '@tanstack/react-store'
import type {
  AnyRoute,
  GetStoreConfig,
  RouterReadableStore,
  RouterStores,
} from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> {}

  export interface RouterStores<in out TRouteTree extends AnyRoute> {
    /** Maps each active routeId to the matchId of its child in the match tree. */
    childMatchIdByRouteId: RouterReadableStore<Record<string, string>>
  }
}

function initRouterStores(
  stores: RouterStores<AnyRoute>,
  createReadonlyStore: <TValue>(
    read: () => TValue,
  ) => RouterReadableStore<TValue>,
) {
  stores.childMatchIdByRouteId = createReadonlyStore(() => {
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
}

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
      init: (stores) =>
        initRouterStores(stores, createNonReactiveReadonlyStore),
    }
  }

  return {
    createMutableStore: createStore,
    createReadonlyStore: createStore,
    batch: batch,
    init: (stores) => initRouterStores(stores, createStore),
  }
}
