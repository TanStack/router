import { AnyUpdater, Store } from '@tanstack/store'
import { onCleanup, onMount } from 'solid-js'
import { createStore } from 'solid-js/store'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState extends object,
  TSelected extends object = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  routerStore: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
): TSelected {
  const [state, setState] = createStore<TSelected>(selector(routerStore.state))

  onMount(() => {
    const unsubscribe = routerStore.subscribe((tState) =>
      setState(selector(tState)),
    )
    onCleanup(unsubscribe)
  })

  return state
}
