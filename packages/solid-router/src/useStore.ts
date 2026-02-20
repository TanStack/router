import { batch, useStore as useSolidStore } from '@tanstack/solid-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { AnyRouter } from '@tanstack/router-core'
import type { Atom, ReadonlyAtom } from '@tanstack/solid-store'
import type { Accessor } from 'solid-js'

type EqualityFn<T> = (objA: T, objB: T) => boolean

interface UseStoreOptions<T> {
  equal?: EqualityFn<T>
  router?: Pick<AnyRouter, 'isServer'>
}

export { batch }

export function useStore<TState, TSelected = NoInfer<TState>>(
  store: Atom<TState> | ReadonlyAtom<TState>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
  options: UseStoreOptions<TSelected> = {},
): Accessor<TSelected> {
  const contextRouter = useRouter({ warn: false })
  const router = options.router ?? contextRouter
  const _isServer = isServer ?? router?.isServer ?? false

  if (_isServer) {
    const selected = selector(store.get())
    return (() => selected) as Accessor<TSelected>
  }

  const { router: _router, ...storeOptions } = options
  return useSolidStore(store, selector, storeOptions)
}
