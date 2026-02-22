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

export function useStoreOfStoresValue<TValue>(
  storeRef: Vue.Ref<SubscribableStore<TValue> | undefined>,
): Readonly<Vue.Ref<TValue | undefined>> {
  const value = Vue.shallowRef(
    storeRef.value?.state,
  ) as Vue.ShallowRef<TValue | undefined>

  Vue.watch(
    storeRef,
    (store, _previous, onCleanup) => {
      if (!store) {
        value.value = undefined
        return
      }

      const update = () => {
        value.value = store.state
      }
      update()

      const subscription = store.subscribe(update)
      onCleanup(() => cleanupSubscription(subscription))
    },
    { immediate: true },
  )

  return Vue.readonly(value) as Readonly<Vue.Ref<TValue | undefined>>
}
