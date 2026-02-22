import * as Solid from 'solid-js'
import {
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '@tanstack/router-core'
import { batch as solidBatch } from './store'
import type {
  RouterReadableStore,
  RouterStoreConfig,
  RouterStoresFactory,
  RouterWritableStore,
} from '@tanstack/router-core'

function createSolidMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  const [signal, setSignal] = Solid.createSignal(initialValue)
  const read = () => signal()

  return {
    get state() {
      return read()
    },
    setState(updater) {
      setSignal((prev) => updater(prev))
    },
  }
}

function createSolidReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  const memo = Solid.createRoot(() => {
    const computed = Solid.createMemo(read)
    return () => computed()
  })

  return {
    get state() {
      return memo()
    },
  }
}

const clientStoreConfig: RouterStoreConfig = {
  createMutableStore: createSolidMutableStore,
  createReadonlyStore: createSolidReadonlyStore,
  batch: solidBatch,
}

export const solidRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

    return {
      stores: createRouterStoresWithConfig(initialState, clientStoreConfig),
      batch: solidBatch,
    }
  },
}
