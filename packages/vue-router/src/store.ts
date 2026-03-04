import * as Vue from 'vue'
import { createStore, batch as storeBatch } from '@tanstack/store'
import type {
  RouterReadableStore,
  RouterWritableStore,
} from '@tanstack/router-core'

type EqualityFn<T> = (objA: T, objB: T) => boolean
type UseStoreOptions<T> = {
  equal?: EqualityFn<T>
}
type Listener<TValue> = (state: TValue) => void
type SubscribeReturn = {
  unsubscribe: () => void
}
type SubscribableStore<TValue> = RouterReadableStore<TValue> & {
  subscribe: (listener: Listener<TValue>) => SubscribeReturn | (() => void)
}

export function createVueMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  const store = createStore(initialValue)

  return {
    get state() {
      return store.get()
    },
    setState(updater: (prev: TValue) => TValue) {
      store.setState(updater)
    },
    subscribe(listener: Listener<TValue>) {
      return store.subscribe(listener)
    },
  } as RouterWritableStore<TValue>
}

export function createVueReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  const store = createStore(read)

  return {
    get state() {
      return store.get()
    },
    subscribe(listener: Listener<TValue>) {
      return store.subscribe(listener)
    },
  } as RouterReadableStore<TValue>
}

export function useStore<TState, TSelected = TState>(
  store: RouterReadableStore<TState>,
  selector: (state: TState) => TSelected = (d) => d as unknown as TSelected,
  options: UseStoreOptions<TSelected> = {},
): Readonly<Vue.Ref<TSelected>> {
  const slice = Vue.ref(selector(store.state)) as Vue.Ref<TSelected>
  const equal = options.equal ?? shallow

  Vue.watch(
    () => store,
    (value, _oldValue, onCleanup) => {
      const subscribable = value as SubscribableStore<TState>
      if (typeof subscribable.subscribe === 'function') {
        const unsubscribe = subscribable.subscribe((state) => {
          const data = selector(state)
          if (equal(Vue.toRaw(slice.value), data)) {
            return
          }
          slice.value = data
        })

        onCleanup(() => {
          if (typeof unsubscribe === 'function') {
            unsubscribe()
            return
          }

          unsubscribe.unsubscribe()
        })
        return
      }

      const stop = Vue.watchEffect(() => {
        const data = selector(value.state)
        if (equal(Vue.toRaw(slice.value), data)) {
          return
        }
        slice.value = data
      })

      onCleanup(stop)
    },
    { immediate: true },
  )

  return Vue.readonly(slice) as Readonly<Vue.Ref<TSelected>>
}

export function batch(fn: () => void) {
  storeBatch(fn)
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
