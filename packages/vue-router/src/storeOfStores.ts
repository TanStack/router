import * as Vue from 'vue'

type SubscribableStore<TValue> = {
  state: TValue
  subscribe?: (
    listener: () => void,
  ) => (() => void) | { unsubscribe: () => void }
}

export function useStoreOfStoresValue<TValue, TSelected>(
  storeRef: Vue.Ref<SubscribableStore<TValue> | undefined>,
  selector: (value: TValue | undefined) => TSelected,
  equal: (a: TSelected, b: TSelected) => boolean = Object.is,
): Readonly<Vue.Ref<TSelected>> {
  const selected = Vue.shallowRef(
    selector(storeRef.value?.state),
  ) as Vue.ShallowRef<TSelected>

  const syncSelected = () => {
    const next = selector(storeRef.value?.state)
    if (!equal(selected.value, next)) {
      selected.value = next
    }
  }

  Vue.watch(
    storeRef,
    (store, _previous, onCleanup) => {
      syncSelected()

      if (!store?.subscribe) {
        return
      }

      const unsubscribe = store.subscribe(() => {
        syncSelected()
      })

      onCleanup(() => {
        if (typeof unsubscribe === 'function') {
          unsubscribe()
          return
        }

        unsubscribe.unsubscribe()
      })
    },
    { immediate: true },
  )

  Vue.watch(
    () => selector(storeRef.value?.state),
    () => {
      if (!storeRef.value?.subscribe) {
        syncSelected()
      }
    },
  )

  return Vue.readonly(selected) as Readonly<Vue.Ref<TSelected>>
}
