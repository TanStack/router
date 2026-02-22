import * as Solid from 'solid-js'
import type { RouterReadableStore } from '@tanstack/router-core'

type EqualityFn<T> = (objA: T, objB: T) => boolean
interface UseStoreOptions<T> {
  equal?: EqualityFn<T>
}

type StoreLike<TValue> = Pick<RouterReadableStore<TValue>, 'state'>

export function useStore<TState, TSelected = TState>(
  store: StoreLike<TState>,
  selector: (state: TState) => TSelected = (d) => d as unknown as TSelected,
  options: UseStoreOptions<TSelected> = {},
): Solid.Accessor<TSelected> {
  const equal = options.equal ?? shallow

  return Solid.createMemo(() => selector(store.state), undefined, {
    equals: equal,
  })
}

export function shallow<T>(objA: T, objB: T) {
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

  if (objA instanceof Map && objB instanceof Map) {
    if (objA.size !== objB.size) return false
    for (const [k, v] of objA) {
      if (!objB.has(k) || !Object.is(v, objB.get(k))) return false
    }
    return true
  }

  if (objA instanceof Set && objB instanceof Set) {
    if (objA.size !== objB.size) return false
    for (const v of objA) {
      if (!objB.has(v)) return false
    }
    return true
  }

  if (objA instanceof Date && objB instanceof Date) {
    if (objA.getTime() !== objB.getTime()) return false
    return true
  }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is(objA[key as keyof T], objB[key as keyof T])
    ) {
      return false
    }
  }
  return true
}
