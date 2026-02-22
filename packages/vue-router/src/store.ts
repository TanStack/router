import * as Vue from 'vue'
import { batch as vueBatch, useStore as useVueStore } from '@tanstack/vue-store'
import type { RouterReadableStore } from '@tanstack/router-core'

type StoreWithSubscription<TValue> = RouterReadableStore<TValue> & {
  get?: () => TValue
  subscribe?: (listener: () => void) => {
    unsubscribe: () => void
  }
}

type UseStoreOptions<TSelected> = {
  equal?: (a: TSelected, b: TSelected) => boolean
}

function toVueStore<TValue>(store: RouterReadableStore<TValue> | undefined) {
  if (!store) {
    return {
      get state() {
        return undefined as TValue
      },
      get: () => undefined as TValue,
      subscribe: () => ({
        unsubscribe: () => {},
      }),
    }
  }

  const maybeStore = store as StoreWithSubscription<TValue>

  if (
    typeof maybeStore.get === 'function' &&
    typeof maybeStore.subscribe === 'function'
  ) {
    return maybeStore
  }

  return {
    get state() {
      return store.state
    },
    get: () => store.state,
    subscribe: () => ({
      unsubscribe: () => {},
    }),
  }
}

export function useStore<TState, TSelected = TState>(
  store: RouterReadableStore<TState> | undefined,
  selector: (state: TState) => TSelected = (d) => d as unknown as TSelected,
  options?: UseStoreOptions<TSelected>,
): Vue.Ref<TSelected> {
  return useVueStore(
    toVueStore(store) as any,
    selector as any,
    options as any,
  ) as Vue.Ref<TSelected>
}

export function batch<TValue>(fn: () => TValue): TValue {
  let result!: TValue
  vueBatch(() => {
    result = fn()
  })
  return result
}
