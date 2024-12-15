import { useSyncExternalStore } from 'react'
import { useRouter } from './useRouter'
import type { RouterHistory } from '@tanstack/history'

export function useCanGoBack() {
  const router = useRouter()
  const history: RouterHistory = router.history

  return useSyncExternalStore(history.subscribe, history.canGoBack)
}
