import { isRedirect, useRouter } from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'

/**
 * Wrap a server function so its `redirect()` throws are routed through
 * the router instead of bubbling out of the call site. Mirrors
 * `useServerFn` from `@tanstack/solid-start`.
 *
 * Without this wrapper, calling a server function from a component
 * event handler that throws a redirect would unwind to the React-style
 * "uncaught error" surface. With it, the redirect is intercepted, the
 * `_fromLocation` is patched in, and `router.navigate(redirect)` runs
 * — the user sees an instant navigation rather than an error.
 *
 * @example
 * ```ts
 * function CheckoutButton(handle: Handle) {
 *   const submitOrder = useServerFn(handle, submitOrderFn)
 *   return () => (
 *     <button mix={[on('click', () => submitOrder({ data: cartId }))]}>
 *       Place order
 *     </button>
 *   )
 * }
 * ```
 */
export function useServerFn<
  T extends (...args: Array<any>) => Promise<any>,
>(handle: Handle<any, any>, serverFn: T): (...args: Parameters<T>) => ReturnType<T> {
  const router = useRouter(handle)

  return (async (...args: Array<any>) => {
    try {
      const res = await serverFn(...args)
      if (isRedirect(res)) {
        throw res
      }
      return res
    } catch (err) {
      if (isRedirect(err)) {
        ;(err as any).options._fromLocation = router.stores.location.get()
        return router.navigate(router.resolveRedirect(err as any).options)
      }
      throw err
    }
  }) as any
}
