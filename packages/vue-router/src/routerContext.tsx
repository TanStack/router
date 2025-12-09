import * as Vue from 'vue'
import type { AnyRouter } from '@tanstack/router-core'

// Create a router context symbol
export const RouterSymbol = Symbol(
  'TanStackRouter',
) as Vue.InjectionKey<AnyRouter>

declare global {
  interface Window {
    __TSR_ROUTER_CONTEXT__?: Vue.InjectionKey<AnyRouter>
  }
}

/**
 * Gets the router context, handling server-side rendering
 * and ensuring a single instance across the application
 */
export function getRouterContext(): Vue.InjectionKey<AnyRouter> {
  if (typeof document === 'undefined') {
    // For SSR, return the symbol directly
    return RouterSymbol
  }

  // In the browser, check if we have a cached context
  if (window.__TSR_ROUTER_CONTEXT__) {
    return window.__TSR_ROUTER_CONTEXT__
  }

  // Create and cache the context
  window.__TSR_ROUTER_CONTEXT__ = RouterSymbol
  return RouterSymbol
}

/**
 * Provides the router to all child components
 */
export function provideRouter(router: AnyRouter): void {
  Vue.provide(getRouterContext(), router)
}

/**
 * Injects the router from the component tree
 */
export function injectRouter(): AnyRouter {
  const router = Vue.inject<AnyRouter | null>(getRouterContext(), null)
  if (!router) {
    throw new Error(
      'No TanStack Router found in component tree. Did you forget to add a RouterProvider component?',
    )
  }
  return router
}
