import * as Solid from 'solid-js'

type SubscribableStore<TValue> = {
  state: TValue
}

export function useStoreOfStoresValue<TValue, TSelected>(
  storeAccessor: Solid.Accessor<SubscribableStore<TValue> | undefined>,
  selector: (value: TValue | undefined) => TSelected,
  equal: (a: TSelected, b: TSelected) => boolean = Object.is,
): Solid.Accessor<TSelected> {
  return Solid.createMemo(() => selector(storeAccessor()?.state), undefined, {
    equals: equal,
  })
}
