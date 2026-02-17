import { useStore } from '@tanstack/react-store'
import { useRouter } from './useRouter'

export function useCanGoBack() {
  const router = useRouter()
  return useStore(router.stateStore, (s) => s.location.state.__TSR_index !== 0)
}
