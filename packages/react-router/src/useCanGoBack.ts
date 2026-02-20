import { useStore } from './useStore'
import { useRouter } from './useRouter'

export function useCanGoBack() {
  const router = useRouter()
  return useStore(
    router.locationStore,
    (location) => location.state.__TSR_index !== 0,
  )
}
