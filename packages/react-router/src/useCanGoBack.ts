import { useStore } from '@tanstack/react-store'
import { isServer } from '@tanstack/router-core/isServer'
import { useHydrated } from './ClientOnly'
import { useRouter } from './useRouter'

export function useCanGoBack() {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    return router.stores.location.get().state.__TSR_index !== 0
  }

  /* eslint-disable react-hooks/rules-of-hooks -- condition is static */
  // The server renders a fresh single entry history per request, so it always
  // reports `false`. The browser preserves `history.state` across a reload and
  // can start on a deeper entry, so reporting the real index while hydrating
  // would contradict the server markup. Defer to the server value until
  // hydration has settled, then report the browser's history.
  const isHydrated = useHydrated()
  const canGoBack = useStore(
    router.stores.location,
    (location) => location.state.__TSR_index !== 0,
  )
  /* eslint-enable react-hooks/rules-of-hooks */

  return isHydrated && canGoBack
}
