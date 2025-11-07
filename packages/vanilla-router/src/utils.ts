import type { AnyRouter, RouterState } from '@tanstack/router-core'
import { replaceEqualDeep } from '@tanstack/router-core'

/**
 * Subscribe to router state changes with optional selector
 * This is a vanilla JS equivalent of useRouterState hook
 * 
 * @param router - The router instance
 * @param callback - Function called whenever router state changes (or selected state changes)
 * @param selector - Optional function to select a portion of the router state
 * @param structuralSharing - Whether to use structural sharing (deep equality check) for the selected value
 * @returns Unsubscribe function
 */
export function subscribeRouterState<TRouter extends AnyRouter>(
  router: TRouter,
  callback: (state: RouterState<TRouter['routeTree']>) => void,
  selector?: (state: RouterState<TRouter['routeTree']>) => any,
  structuralSharing?: boolean,
): () => void {
  let previousResult: any = undefined

  const unsubscribe = router.subscribeState((state) => {
    if (selector) {
      const newSlice = selector(state)
      
      if (structuralSharing ?? router.options.defaultStructuralSharing) {
        const sharedSlice = replaceEqualDeep(previousResult, newSlice)
        previousResult = sharedSlice
        
        // Always call callback - replaceEqualDeep handles equality checking
        callback(sharedSlice)
      } else {
        callback(newSlice)
      }
    } else {
      callback(state)
    }
  })

  return unsubscribe
}

/**
 * Get current router state (synchronous)
 * This is a vanilla JS equivalent of useRouterState hook without subscription
 * 
 * @param router - The router instance
 * @param selector - Optional function to select a portion of the router state
 * @returns Current router state or selected portion
 */
export function getRouterState<TRouter extends AnyRouter>(
  router: TRouter,
  selector?: (state: RouterState<TRouter['routeTree']>) => any,
): any {
  const state = router.state
  return selector ? selector(state) : state
}

/**
 * Get current location from router state
 * This is a vanilla JS equivalent of useLocation hook
 * 
 * @param router - The router instance
 * @param selector - Optional function to select a portion of the location
 * @returns Current location or selected portion
 */
export function getLocation<TRouter extends AnyRouter>(
  router: TRouter,
  selector?: (location: RouterState<TRouter['routeTree']>['location']) => any,
): any {
  const location = router.state.location
  return selector ? selector(location) : location
}

/**
 * Get current matches from router state
 * This is a vanilla JS equivalent of useMatches hook
 * 
 * @param router - The router instance
 * @param selector - Optional function to select/transform matches
 * @returns Current matches or selected/transformed matches
 */
export function getMatches<TRouter extends AnyRouter>(
  router: TRouter,
  selector?: (matches: RouterState<TRouter['routeTree']>['matches']) => any,
): any {
  const matches = router.state.matches
  return selector ? selector(matches) : matches
}

