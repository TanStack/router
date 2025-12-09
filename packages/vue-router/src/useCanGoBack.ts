import { useRouterState } from './useRouterState'

export function useCanGoBack() {
  return useRouterState({ select: (s) => s.location.state.__TSR_index !== 0 })
}
