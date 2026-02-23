import * as Vue from 'vue'

type UnsubscribeResult = (() => void) | { unsubscribe: () => void }

type SubscribableStore<TValue> = {
  state: TValue
  subscribe: (listener: () => void) => UnsubscribeResult
}

function cleanupSubscription(subscription: UnsubscribeResult) {
  if (typeof subscription === 'function') {
    subscription()
    return
  }
  subscription.unsubscribe()
}

export function useStoreOfStoresValue<TValue, TSelected>(
  storeRef: Vue.Ref<SubscribableStore<TValue> | undefined>,
  selector: (value: TValue | undefined) => TSelected,
  equal: (a: TSelected, b: TSelected) => boolean = Object.is,
): Readonly<Vue.Ref<TSelected>> {
  const selected = Vue.shallowRef(
    selector(storeRef.value?.state),
  ) as Vue.ShallowRef<TSelected>

  Vue.watch(
    storeRef,
    (store, _previous, onCleanup) => {
      const update = (value: TValue | undefined) => {
        const next = selector(value)
        if (!equal(selected.value, next)) {
          selected.value = next
        }
      }

      if (!store) {
        update(undefined)
        return
      }

      update(store.state)
      const subscription = store.subscribe(() => update(store.state))
      onCleanup(() => cleanupSubscription(subscription))
    },
    { immediate: true },
  )

  return Vue.readonly(selected) as Readonly<Vue.Ref<TSelected>>
}
