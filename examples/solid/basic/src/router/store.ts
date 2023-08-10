import { AnyUpdater, Store } from '@tanstack/store'
import { onCleanup, onMount } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

export { Store }

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState,
  TSelected = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  routerStore: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
): TSelected {
  const [state, setState] = createStore<{ routerStore: TSelected }>({
    routerStore: selector(routerStore.state),
  })

  onMount(() => {
    const unsubscribe = routerStore.subscribe(() => {
      const updatedState = selector(routerStore.state)

      setState('routerStore', reconcile(updatedState))
    })
    onCleanup(unsubscribe)
  })

  return state.routerStore
}

function shallowFindMissingKeys<TState extends Object>(
  oldState: TState,
  newState: TState,
): Record<keyof TState, undefined> {
  const oldStateKeys = Object.keys(oldState) as (keyof typeof oldState)[]
  const missingKeys: Record<keyof TState, undefined> = oldStateKeys.reduce(
    (acc, key) => {
      if (newState[key] === undefined) {
        acc[key] = undefined
      }

      return acc
    },
    {} as Record<keyof TState, undefined>,
  )

  return missingKeys
}
