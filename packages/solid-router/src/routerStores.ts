import * as Solid from 'solid-js'
import {
  createRouterStoresWithConfig,
  createServerRouterStoresBundle,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type {
  RouterReadableStore,
  RouterStoresFactory,
  RouterWritableStore,
} from '@tanstack/router-core'

function createSolidMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  const [signal, setSignal] = Solid.createSignal(initialValue)

  return {
    get state() {
      return signal()
    },
    setState: setSignal,
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

export const solidRouterStoresFactory: RouterStoresFactory = {
  createRouterStores(initialState, opts) {
    if (isServer ?? opts.isServer) {
      return createServerRouterStoresBundle(initialState)
    }

    return {
      stores: createRouterStoresWithConfig(initialState, {
        createMutableStore: createSolidMutableStore,
        createReadonlyStore: createSolidReadonlyStore,
        batch: Solid.batch,
      }),
      batch: Solid.batch,
    }
  },
}
