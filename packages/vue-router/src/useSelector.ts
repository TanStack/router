import * as Vue from 'vue'
import { useSelector as useTanStackSelector } from '@tanstack/vue-store'
import type { UseSelectorOptions } from '@tanstack/vue-store'

type StoreSource<T> = {
  get: () => T
  subscribe: (listener: (value: T) => void) => {
    unsubscribe: () => void
  }
}

// Vue Router hooks can run while functional components render, where there is
// no active effect scope for @tanstack/vue-store's useSelector cleanup. Run the
// upstream hook in a scope tied to the current component's unmount lifecycle.
export function useSelector<TState, TSelected = NoInfer<TState>>(
  store: StoreSource<TState>,
  selector: (state: NoInfer<TState>) => TSelected = (state) =>
    state as unknown as TSelected,
  options?: UseSelectorOptions<TSelected>,
): Readonly<Vue.Ref<TSelected>> {
  const run = () => useTanStackSelector(store, selector, options)

  if (Vue.getCurrentScope()) {
    return run()
  }

  const instance = Vue.getCurrentInstance()
  if (!instance) {
    return run()
  }

  const scope = Vue.effectScope(true)
  const slice = scope.run(run)!

  Vue.onUnmounted(() => scope.stop(), instance)

  return slice
}
