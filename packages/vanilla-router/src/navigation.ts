import type { AnyRouter, NavigateOptions } from '@tanstack/router-core'

/**
 * Navigate programmatically
 * This is a vanilla JS equivalent of useNavigate hook
 * 
 * @param router - The router instance
 * @param options - Navigation options (to, params, search, hash, replace, etc.)
 * @returns Promise that resolves when navigation completes
 */
export function navigate<TRouter extends AnyRouter>(
  router: TRouter,
  options: NavigateOptions<TRouter>,
): Promise<void> {
  return router.navigate(options)
}

/**
 * Check if the router can go back in history
 * This is a vanilla JS equivalent of useCanGoBack hook
 * 
 * @param router - The router instance
 * @returns True if can go back, false otherwise
 */
export function canGoBack<TRouter extends AnyRouter>(
  router: TRouter,
): boolean {
  return router.history.canGoBack()
}

/**
 * Go back in history
 * Equivalent to browser back button
 * 
 * @param router - The router instance
 * @param options - Optional navigation options (e.g., ignoreBlocker)
 */
export function goBack<TRouter extends AnyRouter>(
  router: TRouter,
  options?: { ignoreBlocker?: boolean },
): void {
  router.history.back(options)
}

/**
 * Go forward in history
 * Equivalent to browser forward button
 * 
 * @param router - The router instance
 * @param options - Optional navigation options (e.g., ignoreBlocker)
 */
export function goForward<TRouter extends AnyRouter>(
  router: TRouter,
  options?: { ignoreBlocker?: boolean },
): void {
  router.history.forward(options)
}

/**
 * Go to a specific index in history
 * 
 * @param router - The router instance
 * @param index - The index to navigate to (negative goes back, positive goes forward)
 * @param options - Optional navigation options (e.g., ignoreBlocker)
 */
export function go<TRouter extends AnyRouter>(
  router: TRouter,
  index: number,
  options?: { ignoreBlocker?: boolean },
): void {
  router.history.go(index, options)
}

