import { useRouterState } from './useRouterState'

/**
 * Returns whether navigation back is possible.
 * Uses the internal history index to determine if we can go back.
 *
 * @returns `true` if there is history to navigate back to, `false` otherwise.
 */
export function useCanGoBack(): boolean {
  return useRouterState({
    select: (s): boolean => (s.location.state as any)?.__TSR_index !== 0,
  })
}
