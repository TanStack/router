import * as Solid from 'solid-js'
import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRouter } from '@tanstack/router-core'

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
  storeAccessor: Solid.Accessor<SubscribableStore<TValue> | undefined>,
  selector: (value: TValue | undefined) => TSelected,
  equal: (a: TSelected, b: TSelected) => boolean = Object.is,
  router?: Pick<AnyRouter, 'isServer'>,
): Solid.Accessor<TSelected> {
  const _isServer = isServer ?? router?.isServer ?? false
  if (_isServer) {
    const selected = selector(storeAccessor()?.state)
    return (() => selected) as Solid.Accessor<TSelected>
  }

  const [selected, setSelected] = Solid.createSignal(
    selector(storeAccessor()?.state),
  )

  Solid.createEffect(() => {
    const store = storeAccessor()
    if (!store) {
      const next = selector(undefined)
      setSelected((prev) => (equal(prev, next) ? prev : next))
      return
    }

    const update = () => {
      const next = selector(store.state)
      setSelected((prev) => (equal(prev, next) ? prev : next))
    }

    update()
    const subscription = store.subscribe(update)
    Solid.onCleanup(() => {
      cleanupSubscription(subscription)
    })
  })

  return selected
}
