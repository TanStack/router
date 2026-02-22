import * as Solid from 'solid-js'

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
  storeAccessor: Solid.Accessor<SubscribableStore<TValue> | undefined>,
): Solid.Accessor<TValue | undefined> {
  const [value, setValue] = Solid.createSignal<TValue | undefined>(
    storeAccessor()?.state,
  )

  Solid.createEffect(() => {
    const store = storeAccessor()
    if (!store) {
      setValue(() => undefined)
      return
    }

    const update = () => setValue(() => store.state)

    update()
    const subscription = store.subscribe(update)
    Solid.onCleanup(() => {
      cleanupSubscription(subscription)
    })
  })

  return value
}
