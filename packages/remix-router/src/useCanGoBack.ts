import { useRouter } from './useRouter'
import { subscribeSelected } from './subscribe'
import type { Handle } from '@remix-run/ui'

/**
 * Returns a getter `() => boolean` indicating whether the router can go back
 * (i.e. has a non-zero history index).
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useCanGoBackHook
 */
export function useCanGoBack(handle: Handle<any, any>): () => boolean {
  const router = useRouter(handle)
  return subscribeSelected(handle, router.stores.location, {
    select: (location) => location.state.__TSR_index !== 0,
  })
}
