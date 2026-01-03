import { computed, effect, signal, Signal } from '@angular/core'
import { AnyRouter, RouterState } from '@tanstack/router-core'

/**
 * Subscribe to a signal state where the router is a
 * signal that can't be read before initialization
 * @param routerSignal - The signal that contains the router
 * @returns - A signal that contains the router state
 */
export function injectLazyRouterState(
  routerSignal: Signal<AnyRouter>,
): Signal<RouterState> {
  const routerState = signal<RouterState | undefined>(undefined)

  effect((onCleanup) => {
    const router = routerSignal()
    const unsubscribe = router.__store.subscribe((state) => {
      routerState.set(state.currentVal)
    })
    onCleanup(() => unsubscribe())
  })

  return computed(() => routerState() ?? routerSignal().__store.state)
}
