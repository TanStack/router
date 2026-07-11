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
  const [signal, setSignal] = Solid.createSignal(initialValue)

  return { get: signal, set: setSignal }
}

let finalizationRegistry: FinalizationRegistry<() => void> | null = null
if (typeof globalThis !== 'undefined' && 'FinalizationRegistry' in globalThis) {
  finalizationRegistry = new FinalizationRegistry((cb) => cb())
}

function createSolidReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  let dispose!: () => void
  const memo = Solid.createRoot((d) => {
    dispose = d
    return Solid.createMemo(read)
  })
  const store = { get: memo }
  finalizationRegistry?.register(store, dispose)
  return store
}

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createSolidMutableStore,
    createReadonlyStore: createSolidReadonlyStore,
    batch: Solid.batch,
  }
}
