import type { AnyRouter, AnyRoute } from '@tanstack/router-core'
import { isNotFound } from '@tanstack/router-core'
import { setupScrollRestorationUtil } from './scroll-restoration'

/**
 * Internal outlet marker - used by outlet() function
 */
const OUTLET_MARKER = '__TANSTACK_ROUTER_OUTLET__'

/**
 * Function to mark where child routes should be rendered
 * Returns a special marker that will be replaced with child content
 */
export function outlet(): string {
  return OUTLET_MARKER
}

/**
 * Process router matches and return nested HTML strings
 * Handles outlet replacement for nested routes automatically
 * Returns an array of HTML strings in render order
 * 
 * @param router - The router instance
 * @param matches - Array of matches from router.state.matches
 * @returns Array of HTML strings with nested routes properly composed
 */
export function getMatchesHtml(
  router: AnyRouter,
  matches: AnyRouter['state']['matches'],
): string[] {
  const htmlParts: string[] = []

  matches.forEach((match, index) => {
    // Get HTML for this match
    const componentHtml = getMatchHtml(router, match)

    // For nested routes, replace outlet marker in parent
    if (index > 0 && htmlParts.length > 0) {
      const lastHtml = htmlParts[htmlParts.length - 1]
      if (lastHtml.includes(OUTLET_MARKER)) {
        htmlParts[htmlParts.length - 1] = lastHtml.replace(
          OUTLET_MARKER,
          componentHtml,
        )
      } else {
        htmlParts.push(componentHtml)
      }
    } else {
      htmlParts.push(componentHtml)
    }
  })

  // Clean up any remaining outlet markers (e.g., when root route has outlet but no children)
  return htmlParts.map(html => html.replace(OUTLET_MARKER, ''))
}

/**
 * Get HTML for a single match (handles error, pending, not found, and component states)
 */
function getMatchHtml(router: AnyRouter, match: AnyRouter['state']['matches'][0]): string {
  const route: AnyRoute = router.routesById[match.routeId]
  const matchState = router.getMatch(match.id)
  
  try {
    // Check for not found status first (like React/Preact adapters)
    if (match.status === 'notFound') {
      const notFoundComponent = route.options.notFoundComponent === false
        ? undefined
        : route.options.notFoundComponent ?? router.options.defaultNotFoundComponent
      
      if (notFoundComponent && matchState?.error && isNotFound(matchState.error)) {
        const notFoundFactory = notFoundComponent({ data: matchState.error })
        const notFoundHtml = notFoundFactory(router)
        return typeof notFoundHtml === 'string' ? notFoundHtml : notFoundHtml()
      }
      
      // Fallback if no notFoundComponent configured
      return '<div>Not Found</div>'
    }

    // Get components from route options
    const errorComponent = route.options.errorComponent === false
      ? undefined
      : route.options.errorComponent ?? router.options.defaultErrorComponent
    const pendingComponent = route.options.pendingComponent ?? router.options.defaultPendingComponent
    const component = route.options.component ?? router.options.defaultComponent

    // Check for error state
    if (matchState?.error && errorComponent) {
      const errorFactory = errorComponent({ error: matchState.error })
      const errorHtml = errorFactory(router)
      return typeof errorHtml === 'string' ? errorHtml : errorHtml()
    }

    // Check for pending state
    if (matchState?._displayPending && pendingComponent) {
      const pendingHtml = pendingComponent(router)
      return typeof pendingHtml === 'string' ? pendingHtml : pendingHtml()
    }

    // Render component
    if (component) {
      const componentHtml = component(router)
      return typeof componentHtml === 'string' ? componentHtml : componentHtml()
    }

    return ''
  } catch (error) {
    // If component throws, return empty string
    console.error('Error rendering component:', error)
    return ''
  }
}

/**
 * Build a type-safe href for navigation
 * Useful for direct DOM manipulation where you don't have Link components
 * Behaves like navigate() and <Link> APIs - accepts a 'to' path string
 */
export function buildHref(
  router: AnyRouter,
  options: {
    to?: string
    params?: Record<string, any>
    search?: Record<string, any>
    hash?: string
  },
): string {
  const location = router.buildLocation({
    to: options.to,
    params: options.params,
    search: options.search,
    hash: options.hash,
  })
  return location.href
}

/**
 * Enable automatic link handling for the entire document
 * Returns a cleanup function to remove event listeners
 */
export function setupLinkHandlers(router: AnyRouter): () => void {
  // Use event delegation for link clicks on the entire document
  const linkClickHandler = (e: Event) => {
    const target = e.target as HTMLElement
    const link = target.closest('a[href]') as HTMLAnchorElement
    if (!link) return

    const href = link.getAttribute('href')
    if (!href) return

    // Skip external links and links with target
    if (href.startsWith('http://') || href.startsWith('https://')) return
    if (link.target && link.target !== '_self') return

    // Skip if modifier keys are pressed
    if (
      (e as MouseEvent).metaKey ||
      (e as MouseEvent).ctrlKey ||
      (e as MouseEvent).altKey ||
      (e as MouseEvent).shiftKey
    )
      return

    e.preventDefault()
    e.stopPropagation()

    const replace = link.hasAttribute('data-replace')
    const resetScroll = link.hasAttribute('data-reset-scroll')
    const hashScroll = link.getAttribute('data-hash-scroll')

    router
      .navigate({
        to: href,
        replace,
        resetScroll: resetScroll !== null,
        hashScrollIntoView:
          hashScroll === 'true'
            ? true
            : hashScroll === 'false'
              ? false
              : undefined,
      })
      .then(() => {
        // Router state change will trigger render via subscription
      })
      .catch((err) => {
        console.error('Navigation error:', err)
      })
  }

  document.addEventListener('click', linkClickHandler, true)

  // Return cleanup function
  return () => {
    document.removeEventListener('click', linkClickHandler, true)
  }
}

/**
 * Setup router with automatic state subscription and link handling
 * This is a convenience function that combines subscribeState and setupLinkHandlers
 * Also handles initial loading and rendering
 * 
 * @param router - The router instance
 * @param renderCallback - Function called whenever router state changes to render the UI
 * @returns Cleanup function that unsubscribes from state changes and removes link handlers
 */
export async function vanillaRouter(
  router: AnyRouter,
  renderCallback: () => void,
): Promise<() => void> {
  // Load initial matches if needed
  if (router.state.matches.length === 0) {
    try {
      await router.load()
    } catch (error) {
      console.error('Error loading router:', error)
    }
  }

  // Setup scroll restoration if enabled
  if (router.options.scrollRestoration) {
    setupScrollRestorationUtil(router)
  }

  // Initial render
  renderCallback()

  // Subscribe to router state changes
  // Use subscribeState if available (vanilla Router), otherwise fall back to __store
  const unsubscribeState = 
    typeof (router as any).subscribeState === 'function'
      ? (router as any).subscribeState(renderCallback)
      : router.__store.subscribe(renderCallback)
  
  // Setup link handlers on document
  const cleanupLinkHandlers = setupLinkHandlers(router)
  
  // Return combined cleanup function
  return () => {
    unsubscribeState()
    cleanupLinkHandlers()
  }
}

