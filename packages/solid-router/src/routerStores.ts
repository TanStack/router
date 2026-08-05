import * as Solid from 'solid-js'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type {
  GetStoreConfig,
  RouterReadableStore,
  RouterWritableStore,
} from '@tanstack/router-core'

function createSolidMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  const [signal, setSignal] = Solid.createSignal(initialValue as any)

  return { get: signal, set: setSignal }
}

function createSolidReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  return { get: Solid.createRoot(() => Solid.createMemo(read)) }
}

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  let depth = 0

  return {
    createMutableStore: createSolidMutableStore,
    createReadonlyStore: createSolidReadonlyStore,
    batch: (fn) => {
      depth++
      try {
        fn()
      } finally {
        depth--
        if (depth === 0) {
          try {
            Solid.flush()
          } catch {}
        }
      }
    },
  }
}
