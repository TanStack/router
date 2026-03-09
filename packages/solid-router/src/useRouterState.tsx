import { createMemo, createSignal, onCleanup } from 'solid-js'
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

  const [signal, setSignal] = createSignal(() => selector(router.__store.get()))

  const unsub = router.__store.subscribe((s) => {
    const data = selector(s)
    if (deepEqual(signal(), data)) {
      return
    }
    setSignal(data)
  }).unsubscribe

  onCleanup(() => {
    unsub()
  })

  return signal as Accessor<UseRouterStateResult<TRouter, TSelected>>
}
