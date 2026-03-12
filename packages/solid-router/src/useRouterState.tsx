import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterState,
} from '@tanstack/router-core'
import type { Accessor } from 'solid-js'

function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true

  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!deepEqual(a[key], b[key])) return false
  }

  return true
}

export type UseRouterStateOptions<TRouter extends AnyRouter, TSelected> = {
  router?: TRouter
  select?: (state: RouterState<TRouter['routeTree']>) => TSelected
}

export type UseRouterStateResult<
  TRouter extends AnyRouter,
  TSelected,
> = unknown extends TSelected ? RouterState<TRouter['routeTree']> : TSelected

export function useRouterState<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseRouterStateOptions<TRouter, TSelected>,
): Accessor<UseRouterStateResult<TRouter, TSelected>> {
  const contextRouter = useRouter<TRouter>({
    warn: opts?.router === undefined,
  })
  const router = opts?.router || contextRouter

  // During SSR we render exactly once and do not need reactivity.
  // Avoid subscribing to the store on the server since the server store
  // implementation does not provide subscribe() semantics.
  const _isServer = isServer ?? router.isServer
  if (_isServer) {
    const state = router.state as RouterState<TRouter['routeTree']>
    const selected = createMemo(() =>
      opts?.select ? opts.select(state) : state,
    ) as Accessor<UseRouterStateResult<TRouter, TSelected>>
    return selected
  }

  const selector = (state: any) => {
    if (opts?.select) return opts.select(state)

    return state
  }

  // Track the latest store state in a signal that updates via subscription.
  // We store the full state so that the selector (which may read reactive
  // props like props.matchId) re-runs inside a Solid tracking scope (the
  // createMemo below) rather than inside the store subscriber callback
  // where reactive reads would be untracked.
  const [storeState, setStoreState] = createSignal(router.__store.get())

  const unsub = router.__store.subscribe((s) => {
    setStoreState(s)
  }).unsubscribe

  onCleanup(() => {
    unsub()
  })

  // Run the selector inside a memo so that:
  // 1. Reactive values read by the selector (e.g. props.matchId) are tracked
  // 2. The result is memoized and only updates when the selected value changes
  const selected = createMemo(() => selector(storeState()), undefined, {
    equals: (a: any, b: any) => deepEqual(a, b),
  })

  return selected as Accessor<UseRouterStateResult<TRouter, TSelected>>
}
