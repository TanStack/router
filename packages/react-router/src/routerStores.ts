import { batch, createStore } from '@tanstack/react-store'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { Readable } from '@tanstack/react-store'
import type { GetStoreConfig } from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> { }
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
    createMutableStore: createStore,
    createReadonlyStore: createStore,
    batch: batch,
  }
}