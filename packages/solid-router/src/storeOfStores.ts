import * as Solid from 'solid-js'

export function useStoreOfStoresValue<TValue, TSelected>(
  storeAccessor: Solid.Accessor<{ state: TValue } | undefined>,
  selector: (value: TValue | undefined) => TSelected,
): Solid.Accessor<TSelected> {
  return Solid.createMemo(() => selector(storeAccessor()?.state), undefined, {
    equals: Object.is,
  })
}
