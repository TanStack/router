import { AnyUpdater, Store } from '@tanstack/store'
import { onCleanup, onMount } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState extends object,
  TSelected extends object = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  routerStore: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
  options: { removeMissingKeys?: boolean } = {},
): TSelected {
  const [state, setState] = createStore<{ state: TSelected }>({
    state: selector(routerStore.state),
  })

  onMount(() => {
    const unsubscribe = routerStore.subscribe((tState) => {
      const updatedState = selector(tState)

      setState('state', (s) => {
        /* This is needed for removing keys that have been removed. Example is useSearch
         when the params are removed. Need to make it more than just shallow, but 
         should be okay for now. */
        if (options.removeMissingKeys) {
          const missingKeys = shallowFindMissingKeys(s, updatedState)
          return reconcile({ ...updatedState, ...missingKeys })(s)
        }
        return reconcile(updatedState)(s)
      })
    })
    onCleanup(unsubscribe)
  })

  return state.state
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
