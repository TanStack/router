import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'

export function useCanGoForward() {
  const router = useRouter()
  return useRouterState({
    select: (s) => s.location.state.__TSR_index !== router.history.length - 1,
  })
}
