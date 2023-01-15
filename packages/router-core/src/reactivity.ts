export type SetStoreFunction<T> = (updater: (s: T) => void) => void

export function createStore<T>(initialState: T) {
  const store = initialState
  const setStore: SetStoreFunction<T> = (updater) => {}

  return [store, setStore] as const
}

export function batch(cb: () => void) {
  cb()
}

const EMPTY = {}

export const useStore = <TSeed, TReturn = TSeed>(
  seed: () => TSeed,
  selector?: (seed: TSeed) => TReturn,
  debug?: string,
): TReturn => {
  const valueRef = React.useRef<TReturn>(EMPTY as any)

  // If there is no selector, track the seed
  // If there is a selector, do not track the seed
  const getValue = () =>
    (!selector ? seed() : selector(untrack(() => seed()))) as TReturn

  // If empty, initialize the value
  if (valueRef.current === EMPTY) {
    valueRef.current = unwrap(storeToImmutable(undefined, getValue()))
  }

  // Snapshot should just return the current cached value
  const getSnapshot = React.useCallback(() => valueRef.current, [])

  const getStore = React.useCallback(
    (cb: () => void) => {
      // A root is necessary to track effects
      return createRoot((dispose) => {
        createEffect(() => {
          const value = getValue()

          const next = storeToImmutable(valueRef.current, value)

          if (debug)
            console.log(
              debug,
              valueRef.current === next ? 'equal' : 'not equal',
              next,
            )

          // Unwrap the value to get rid of any proxy structures
          valueRef.current = unwrap(next)

          // Call the callback to notify the external store
          cb()
        })

        return dispose
      })
    },
    [seed()],
  )

  return useSyncExternalStore(getStore, getSnapshot, getSnapshot)
}
// export const useStore = <TSeed, TReturn = TSeed>(
//   seed: () => TSeed,
//   selector?: (seed: TSeed) => TReturn,
//   debug?: string,
// ): TReturn => {
//   const valueRef = React.useRef<TReturn>(EMPTY as any)

//   // If there is no selector, track the seed
//   // If there is a selector, do not track the seed
//   const getValue = () =>
//     (!selector ? seed() : selector(untrack(() => seed()))) as TReturn

//   // If empty, initialize the value
//   if (valueRef.current === EMPTY) {
//     valueRef.current = unwrap(storeToImmutable(undefined, getValue()))
//   }

//   // Snapshot should just return the current cached value
//   const getSnapshot = React.useCallback(() => valueRef.current, [])

//   const getStore = React.useCallback(
//     (cb: () => void) => {
//       // A root is necessary to track effects
//       return createRoot((dispose) => {
//         createEffect(() => {
//           const value = getValue()

//           const next = storeToImmutable(valueRef.current, value)

//           if (debug)
//             console.log(
//               debug,
//               valueRef.current === next ? 'equal' : 'not equal',
//               next,
//             )

//           // Unwrap the value to get rid of any proxy structures
//           valueRef.current = unwrap(next)

//           // Call the callback to notify the external store
//           cb()
//         })

//         return dispose
//       })
//     },
//     [seed()],
//   )

//   return useSyncExternalStore(getStore, getSnapshot, getSnapshot)
// }
