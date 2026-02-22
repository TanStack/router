import { batch, createStore } from '@tanstack/vue-store'
import {
  createRouterStoresWithConfig,
} from '@tanstack/router-core'
import type { Readable } from '@tanstack/vue-store'
import type { RouterStoresFactory } from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  interface RouterReadableStore<TValue> extends Readable<TValue> { }
}

export const vueRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState) {
    return {
      stores: createRouterStoresWithConfig(initialState, {
        createMutableStore: createStore,
        createReadonlyStore: createStore,
        batch,
      }),
      batch,
    }
  },
}
