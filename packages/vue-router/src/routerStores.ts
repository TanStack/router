import { batch as vueBatch, createStore } from '@tanstack/vue-store'
import {
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '@tanstack/router-core'
import type {
  RouterBatchFn,
  RouterStoreConfig,
  RouterStoresFactory,
} from '@tanstack/router-core'

const batch: RouterBatchFn = (fn) => {
  let result!: ReturnType<typeof fn>
  vueBatch(() => {
    result = fn()
  })
  return result
}

const clientStoreConfig: RouterStoreConfig = {
  createMutableStore: (initialValue) => createStore(initialValue),
  createReadonlyStore: (read) => createStore(read),
  batch,
}

export const vueRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

    return {
      stores: createRouterStoresWithConfig(initialState, clientStoreConfig),
      batch,
    }
  },
}
