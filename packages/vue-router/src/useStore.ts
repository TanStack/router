import * as Vue from 'vue'
import { batch, useStore as useVueStore } from '@tanstack/vue-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { AnyRouter } from '@tanstack/router-core'
import type { Atom, ReadonlyAtom } from '@tanstack/vue-store'

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
): Readonly<Vue.Ref<TSelected>> {
  const contextRouter = useRouter({ warn: false })
  const router = options.router ?? contextRouter
  const _isServer = isServer ?? router?.isServer ?? false

  if (_isServer) {
    const selected = Vue.ref(selector(store.get())) as Vue.Ref<TSelected>
    return Vue.readonly(selected) as Readonly<Vue.Ref<TSelected>>
  }

  const { router: _router, ...storeOptions } = options
  return useVueStore(store, selector, storeOptions)
}
