import { useStore } from './store'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

export function useCanGoBack() {
  const router = useRouter()

  if (isServer ?? router.isServer) {
    return router.stores.location.state.state.__TSR_index !== 0
  }

  return useStore(
    router.stores.location,
    (location) => location.state.__TSR_index !== 0,
  )
}
