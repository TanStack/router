import * as Vue from 'vue'
import type { AnyRouter } from '@tanstack/router-core'

// Symbol for router injection key
export const RouterSymbol = Symbol('TanStackRouter')

declare global {
  interface Window {
    __TSR_ROUTER_CONTEXT__?: {
      provide: (router: AnyRouter) => void
      inject: () => AnyRouter
    }
  }
}

// Default router factory to use when no router is provided
const EMPTY_ROUTER = null as unknown as AnyRouter

/**
 * Provides a router instance to all child components
 */
export function provideRouter(router: AnyRouter) {
  Vue.provide(RouterSymbol, router)
}

/**
 * Retrieves the router instance from the component tree
 */
export function injectRouter(): AnyRouter {
  const router = Vue.inject<AnyRouter | null>(RouterSymbol, null)
  if (!router) {
    throw new Error(
      'No TanStack Router found in component tree. Did you forget to add a RouterProvider component?'
    )
  }
  return router
}

/**
 * Gets the router provider/injector, handling server-side rendering
 * and ensuring a single instance across the application
 */
export function getRouterContext() {
  if (typeof document === 'undefined') {
    // Server-side context
    return {
      provide: provideRouter,
      inject: injectRouter
    }
  }

  // Check if we already have a context in the window
  if (window.__TSR_ROUTER_CONTEXT__) {
    return window.__TSR_ROUTER_CONTEXT__
  }

  // Create and store the context
  window.__TSR_ROUTER_CONTEXT__ = {
    provide: provideRouter,
    inject: injectRouter
  }

  return window.__TSR_ROUTER_CONTEXT__
}
