import { batch as reactBatch, createStore } from '@tanstack/react-store'
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
  reactBatch(fn)
}

const clientStoreConfig: RouterStoreConfig = {
  createMutableStore: (initialValue) => createStore(initialValue),
  createReadonlyStore: (read) => createStore(read),
  batch,
}

export const reactRouterStoresFactory: RouterStoresFactory = {
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
