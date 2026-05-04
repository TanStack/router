import { createAtom } from '@tanstack/store'
import {
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import type { Atom, ReadonlyAtom } from '@tanstack/store'
import type {
  GetStoreConfig,
  RouterReadableStore,
  RouterWritableStore,
} from '@tanstack/router-core'

type MutableStoreFactory = <TValue>(
  initialValue: TValue,
) => RouterWritableStore<TValue>
type ReadonlyStoreFactory = <TValue>(
  read: () => TValue,
) => RouterReadableStore<TValue>

declare module '@tanstack/router-core' {
  export interface RouterReadableStore<TValue> {
    /**
     * Subscribe to changes. Returns an unsubscribe function.
     * Provided by `@tanstack/store` atoms in browser environments and a
     * no-op on the server.
     */
    subscribe: (listener: () => void) => () => void
  }
}

const isServer = typeof document === 'undefined'

/**
 * `@tanstack/store`'s `atom.subscribe(listener)` returns an
 * Observable-style subscription `{ unsubscribe: () => void }`. The
 * `RouterReadableStore.subscribe` contract expects a teardown function.
 *
 * The earlier implementation mutated `atom.subscribe` in place. That's
 * fragile: atoms share a prototype across instances in some
 * `@tanstack/store` builds, so monkey-patching one atom's `subscribe`
 * could leak to siblings, and a future store version that rejects
 * descriptor mutation would break us silently. Instead we return a
 * fresh wrapper object that delegates `get`/`set` and adapts
 * `subscribe`, keeping the underlying atom untouched.
 */
function adaptReadonlyAtom<TValue>(
  atom: ReadonlyAtom<TValue> | Atom<TValue>,
): RouterReadableStore<TValue> {
  return {
    get: () => atom.get(),
    subscribe: (listener: () => void) => {
      const sub = atom.subscribe(listener)
      return () => sub.unsubscribe()
    },
  }
}

function adaptMutableAtom<TValue>(
  atom: Atom<TValue>,
): RouterWritableStore<TValue> {
  return {
    get: () => atom.get(),
    set: ((next: TValue | ((prev: TValue) => TValue)) => {
      atom.set(next as any)
    }) as RouterWritableStore<TValue>['set'],
    subscribe: (listener: () => void) => {
      const sub = atom.subscribe(listener)
      return () => sub.unsubscribe()
    },
  }
}

const makeMutable: MutableStoreFactory = <TValue>(initialValue: TValue) =>
  adaptMutableAtom<TValue>(createAtom(initialValue))
const makeReadonly: ReadonlyStoreFactory = <TValue>(read: () => TValue) =>
  adaptReadonlyAtom<TValue>(createAtom(read))

export const getStoreFactory: GetStoreConfig = (opts) => {
  if (isServer || opts.isServer) {
    const noopSubscribe = () => () => {}
    return {
      createMutableStore: (v) => ({
        ...createNonReactiveMutableStore(v),
        subscribe: noopSubscribe,
      }),
      createReadonlyStore: (read) => ({
        ...createNonReactiveReadonlyStore(read),
        subscribe: noopSubscribe,
      }),
      batch: (fn) => fn(),
    }
  }
  return {
    createMutableStore: makeMutable,
    createReadonlyStore: makeReadonly,
    batch: (fn) => fn(),
  }
}
