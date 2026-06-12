import { batch, createAtom } from '@tanstack/react-store'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import type { Readable } from '@tanstack/react-store'
import type { GetStoreConfig } from '@tanstack/router-core'

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> extends Readable<TValue> {}
}

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }
  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch: batch,
  }
}
