import { batch, createStore } from '@tanstack/react-store'
import {
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { Readable } from '@tanstack/react-store'
import type { RouterStoresFactory } from '@tanstack/router-core'


declare module '@tanstack/router-core' {
  interface RouterReadableStore<TValue> extends Readable<TValue> { }
}

export const reactRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (isServer ?? opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

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
