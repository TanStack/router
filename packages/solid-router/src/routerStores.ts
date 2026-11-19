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

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  // router-core writes stores and re-reads them synchronously mid-pipeline,
  // but Solid 2 defers signal commits to its scheduler. Rather than forcing a
  // full synchronous flush after every core batch (which runs all effects,
  // including renders, several times per navigation), each store keeps a
  // synchronous shadow of its eventual settled value and serves it until the
  // scheduler catches up. The reactive graph settles on its own schedule; the
  // one explicit flush per navigation is the settle point in `startTransition`.
  let writeEpoch = 0

  function createSolidMutableStore<TValue>(
    initialValue: TValue,
  ): RouterWritableStore<TValue> {
    const [signal, setSignal] = Solid.createSignal(initialValue as any)
    let current = initialValue
    let dirty = false

    return {
      get: () => {
        const settled = signal()
        // `current` is always the post-flush value, so once the signal
        // catches up the shadow can retire until the next write.
        if (dirty && settled === current) dirty = false
        return dirty ? current : settled
      },
      set: (next: TValue | ((prev: TValue) => TValue)) => {
        current =
          typeof next === 'function'
            ? (next as (prev: TValue) => TValue)(current)
            : next
        dirty = true
        writeEpoch++
        setSignal(() => current)
      },
    }
  }

  function createSolidReadonlyStore<TValue>(
    read: () => TValue,
  ): RouterReadableStore<TValue> {
    const memo = Solid.createRoot(() => Solid.createMemo(read))
    let cache: TValue
    let cachedAt = -1

    return {
      get: () => {
        // The memo carries reactive subscriptions; the served value comes
        // from the epoch cache so it is fresh before the scheduler settles
        // and identity-stable across flushes that change nothing.
        memo()
        if (cachedAt !== writeEpoch) {
          cache = Solid.untrack(read)
          cachedAt = writeEpoch
        }
        return cache
      },
    }
  }

  return {
    createMutableStore: createSolidMutableStore,
    createReadonlyStore: createSolidReadonlyStore,
    batch: (fn) => fn(),
  }
}
