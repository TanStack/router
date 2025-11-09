import { useSyncExternalStore } from 'preact/compat'
import type { Store } from '@tanstack/store'

function shallow(objA: any, objB: any): boolean {
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
  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is(objA[key], objB[key])
    ) {
      return false
    }
  }
  return true
}

export function useStore<TState, TSelected = TState>(
  store: Store<TState>,
  selector: (state: TState) => TSelected = (d) => d as any,
): TSelected {
  const subscribe = (callback: () => void) => {
    const unsubscribe = store.subscribe(callback)
    return unsubscribe
  }

  const getSnapshot = () => selector(store.state)

  const slice = useSyncExternalStore(subscribe, getSnapshot) as TSelected

  return slice
}

export { shallow }
