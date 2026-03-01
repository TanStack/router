import { injectRouterState } from './injectRouterState'

export function injectCanGoBack() {
  return injectRouterState({
    select: (s) => s.location.state.__TSR_index !== 0,
  })
}
