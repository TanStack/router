import { AnyUpdater, Store } from '@tanstack/store'
import { onCleanup, onMount } from 'solid-js'
import { createStore } from 'solid-js/store'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState extends object,
  TUpdater extends AnyUpdater = AnyUpdater,
>(routerStore: Store<TState, TUpdater>): TState {
  const [state, setState] = createStore<TState>({ ...routerStore.state })

  onMount(() => {
    const unsubscribe = routerStore.subscribe((tState) => setState(tState))
    onCleanup(unsubscribe)
  })

  return state
}
