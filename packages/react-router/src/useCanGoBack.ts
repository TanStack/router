import { useRouterState } from './useRouterState'

/**
 * Returns whether the router history can safely go back without exiting
 * the application. Useful for render-time UI decisions.
 *
 * @returns boolean indicating back navigation availability.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useCanGoBack
 */
export function useCanGoBack() {
  return useRouterState({ select: (s) => s.location.state.__TSR_index !== 0 })
}
