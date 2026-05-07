import { replaceEqualDeep } from '@tanstack/router-core'
import type { Handle } from '@remix-run/ui'
import type { RouterReadableStore } from '@tanstack/router-core'

/**
 * Subscribe a `remix/ui` component to a router store. Calls `handle.update()`
 * on every change, and unsubscribes when the component disconnects.
 *
 * Returns a getter so call sites read the current value via a tight closure.
 *
 * @example
 * ```ts
 * function MyView(handle: Handle) {
 *   const router = useRouter(handle)
 *   const matches = subscribeStore(handle, router.stores.matches)
 *   return () => <div>{matches().length} active matches</div>
 * }
 * ```
 */
export function subscribeStore<TValue>(
  handle: Handle<any, any>,
  store: RouterReadableStore<TValue>,
): () => TValue {
  const unsubscribe = store.subscribe(() => {
    void handle.update()
  })
  handle.signal.addEventListener('abort', unsubscribe, { once: true })
  return () => store.get()
}

/**
 * Subscribe to a store whose identity may change over the component's
 * lifetime (e.g. a `Match` whose `matchId` prop changes when the active
 * route changes). Each render re-evaluates `getStore`; if it returns a
 * different store than the previous render, the previous subscription
 * is torn down and a fresh subscription is opened.
 *
 * Returns a getter that reads the current store's value. Returns
 * `undefined` if `getStore` returns `undefined`.
 */
export function subscribeDynamicStore<TValue>(
  handle: Handle<any, any>,
  getStore: () => RouterReadableStore<TValue> | undefined,
): () => TValue | undefined {
  let currentStore: RouterReadableStore<TValue> | undefined
  let unsubscribe: (() => void) | undefined

  function bindCurrent(store: RouterReadableStore<TValue> | undefined) {
    if (store === currentStore) return
    unsubscribe?.()
    unsubscribe = undefined
    currentStore = store
    if (store) {
      unsubscribe = store.subscribe(() => {
        void handle.update()
      })
    }
  }

  handle.signal.addEventListener(
    'abort',
    () => {
      unsubscribe?.()
      unsubscribe = undefined
      currentStore = undefined
    },
    { once: true },
  )

  return () => {
    const store = getStore()
    bindCurrent(store)
    return store?.get()
  }
}

/**
 * Subscribe with a `select` projection and optional structural sharing.
 *
 * Mirrors the behaviour of `useStore(store, select)` from
 * `@tanstack/react-store`, but adapted to the Remix `Handle` reactivity
 * model: changes to the source store call `handle.update()`, the projection
 * re-runs on demand, and `replaceEqualDeep` is used to keep references
 * stable across renders when `structuralSharing` is on.
 */
export function subscribeSelected<TValue, TSelected>(
  handle: Handle<any, any>,
  store: RouterReadableStore<TValue>,
  options: {
    select?: (value: TValue) => TSelected
    structuralSharing?: boolean
  },
): () => TSelected {
  const read = subscribeStore(handle, store)
  if (!options.select && !options.structuralSharing) {
    return read as unknown as () => TSelected
  }

  let cached: TSelected | undefined = undefined
  return () => {
    const next = options.select
      ? options.select(read())
      : (read() as unknown as TSelected)
    if (options.structuralSharing) {
      const shared = replaceEqualDeep(cached, next)
      cached = shared
      return shared
    }
    return next
  }
}
