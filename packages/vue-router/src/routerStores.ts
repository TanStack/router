import { batch as vueBatch, createStore } from '@tanstack/vue-store'
import {
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type {
  RouterBatchFn,
  RouterStoreConfig,
  RouterStoresFactory,
} from '@tanstack/router-core'

const batch: RouterBatchFn = (fn) => {
  vueBatch(fn)
}

const clientStoreConfig: RouterStoreConfig = {
  createMutableStore: (initialValue) => createStore(initialValue),
  createReadonlyStore: (read) => createStore(read),
  batch,
}

export const vueRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (isServer ?? opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

    return {
      stores: createRouterStoresWithConfig(initialState, clientStoreConfig),
      batch,
    }
  },
}
