import {
  batch as reactBatch,
  useStore as useReactStore,
} from '@tanstack/react-store'
import type { RouterReadableStore } from '@tanstack/router-core'

type StoreWithSubscription<TValue> = RouterReadableStore<TValue> & {
  get?: () => TValue
  subscribe?: (listener: () => void) => {
    unsubscribe: () => void
  }
}

function toReactStore<TValue>(store: RouterReadableStore<TValue> | undefined) {
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
): TSelected {
  return useReactStore(toReactStore(store) as any, selector as any) as TSelected
}

export function batch(fn: () => void): void {
  reactBatch(fn)
}
