import * as React from 'react'
import { AnyUpdater, Store } from '@tanstack/store'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'

export * from '@tanstack/store'

export type NoInfer<T> = [T][T extends any ? 0 : never]

export function useStore<
  TState,
  TSelected = NoInfer<TState>,
  TUpdater extends AnyUpdater = AnyUpdater,
>(
  store: Store<TState, TUpdater>,
  selector: (state: NoInfer<TState>) => TSelected = (d) => d as any,
) {
  // const isMountedRef = React.useRef(false)
  // const [state, setState] = React.useState<{ ref: TSelected }>({
  //   ref: undefined!,
  // })

  const slice = useSyncExternalStoreWithSelector(
    store.subscribe,
    () => store.state,
    () => store.state,
    selector,
    shallow,
  )

  // if (!isMountedRef.current) {
  //   state.ref = slice
  // }

  // if (slice !== state.ref) {
  //   setState({ ref: slice })
  // }

  // React.useEffect(() => {
  //   isMountedRef.current = true
  //   return () => {
  //     isMountedRef.current = false
  //   }
  // }, [])

  // return state.ref

  return slice
}

export function shallow<T>(objA: T, objB: T) {
  if (Object.is(objA, objB)) {
    return true
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false
  }

  const keysA = Object.keys(objA)
  if (keysA.length !== Object.keys(objB).length) {
    return false
  }

  for (let i = 0; i < keysA.length; i++) {
    if (
      !Object.prototype.hasOwnProperty.call(objB, keysA[i] as string) ||
      !Object.is(objA[keysA[i] as keyof T], objB[keysA[i] as keyof T])
    ) {
      return false
    }
  }
  return true
}
