import { Store, AnyUpdater } from '@tanstack/store'

import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState,
  TSelected = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  store: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
  compareShallow?: boolean,
) {
  const slice = useSyncExternalStoreWithSelector(
    store.subscribe,
    () => store.state,
    () => store.state,
    selector,
    compareShallow ? shallow : undefined,
  )

  return slice
}

function shallow<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  // if (objA instanceof Map && objB instanceof Map) {
  //   if (objA.size !== objB.size) return false

  //   for (const [key, value] of objA) {
  //     if (!Object.is(value, objB.get(key))) {
  //       return false
  //     }
  //   }
  //   return true
  // }

  // if (objA instanceof Set && objB instanceof Set) {
  //   if (objA.size !== objB.size) return false

  //   for (const value of objA) {
  //     if (!objB.has(value)) {
  //       return false
  //     }
  //   }
  //   return true
  // }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i] as string) ||
      !Object.is(objA[keysA[i] as keyof T], objB[keysA[i] as keyof T])
    ) {
      return false
    }
  }
  return true
}
