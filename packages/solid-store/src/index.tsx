import { AnyUpdater, shallow, Store } from '@tanstack/store'
import { createSignal, onMount } from 'solid-js'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState,
  TSelected = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  routerStore: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
  compareShallow?: boolean,
) {
  const [state, setState] = createSignal<TSelected>(
    selector(routerStore.state),
    {
      equals: compareShallow ? false : shallow,
    },
  )

  onMount(() => {
    routerStore.subscribe((tState: NoInfer<TState>) => {
      const value = selector(tState)
      setState(value as any)
    })
  })

  return state
}
