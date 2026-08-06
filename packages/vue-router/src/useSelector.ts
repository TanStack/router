import * as Vue from 'vue'
import { useSelector as useTanStackSelector } from '@tanstack/vue-store'
import type { UseSelectorOptions } from '@tanstack/vue-store'

type StoreSource<T> = {
  get: () => T
  subscribe: (listener: (value: T) => void) => {
    unsubscribe: () => void
  }
}

type FunctionalSelectorState = {
  scope: Vue.EffectScope
}

const functionalSelectorStates = new WeakMap<object, FunctionalSelectorState>()

export function useSelector<TState, TSelected = NoInfer<TState>>(
  store: StoreSource<TState>,
  selector: (state: NoInfer<TState>) => TSelected = (state) =>
    state as unknown as TSelected,
  options?: UseSelectorOptions<TSelected>,
): Readonly<Vue.Ref<TSelected>> {
  const select = () => useTanStackSelector(store, selector, options)

  if (Vue.getCurrentScope()) {
    return select()
  }

  const instance = Vue.getCurrentInstance()
  if (!instance) {
    return select()
  }

  let state = functionalSelectorStates.get(instance)
  if (!state) {
    const functionalState = { scope: Vue.effectScope(true) }
    state = functionalState
    functionalSelectorStates.set(instance, functionalState)

    Vue.onBeforeUpdate(() => {
      functionalState.scope.stop()
      functionalState.scope = Vue.effectScope(true)
    }, instance)
    Vue.onUnmounted(() => {
      functionalState.scope.stop()
      functionalSelectorStates.delete(instance)
    }, instance)
  }

  return state.scope.run(select)!
}
