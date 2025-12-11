import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import type { AnyRouter } from '@tanstack/router-core'
import type { App } from 'vue'

/**
 * Check if the router has any routes with ssr: false or ssr: 'data-only'
 * These routes intentionally cause hydration mismatches because the server
 * renders nothing/placeholder while the client renders the actual component
 */
function hasNoSsrRoutes(router: AnyRouter): boolean {
  // Check current matches for routes with ssr: false or ssr: 'data-only'
  const matches = (router as any).state?.matches
  if (matches) {
    for (const match of matches) {
      if (match.ssr === false || match.ssr === 'data-only') {
        return true
      }
    }
  }

  // Also check route options as fallback
  const routesById = (router as any).routesById
  if (routesById) {
    for (const route of Object.values(routesById)) {
      const ssr = (route as any).options?.ssr
      if (ssr === false || ssr === 'data-only') {
        return true
      }
    }
  }
  return false
}

/**
 * Suppress expected hydration mismatch warnings for routes with ssr: 'data-only' or ssr: false
 * These routes intentionally render different content on server vs client
 * Only install this suppression if the router has such routes
 */
function suppressSsrHydrationMismatches(router: AnyRouter): void {
  // Check routes immediately
  const hasRoutes = hasNoSsrRoutes(router)

  const originalWarn = console.warn
  const originalError = console.error

  const isHydrationMismatchMessage = (args: Array<unknown>): boolean => {
    // Check all args since Vue may pass message in different positions
    for (const arg of args) {
      if (typeof arg !== 'string') continue
      if (
        arg.includes('Hydration completed but contains mismatches') ||
        arg.includes('Hydration node mismatch') ||
        arg.includes('Hydration text mismatch') ||
        arg.includes('Hydration children mismatch') ||
        arg.includes('Hydration class mismatch') ||
        arg.includes('Hydration style mismatch') ||
        arg.includes('Hydration attribute mismatch')
      ) {
        return true
      }
    }
    return false
  }

  console.warn = (...args) => {
    if (isHydrationMismatchMessage(args)) {
      // Re-check routes at runtime in case they weren't loaded initially
      if (hasRoutes || hasNoSsrRoutes(router)) {
        return
      }
    }
    originalWarn.apply(console, args)
  }

  console.error = (...args) => {
    if (isHydrationMismatchMessage(args)) {
      // Re-check routes at runtime in case they weren't loaded initially
      if (hasRoutes || hasNoSsrRoutes(router)) {
        return
      }
    }
    originalError.apply(console, args)
  }
}

/**
 * Configure a Vue app to suppress expected hydration mismatch warnings
 * for routes with ssr: false or ssr: 'data-only'
 * Call this after createSSRApp and before app.mount()
 */
export function configureHydrationSuppressions(
  app: App,
  router: AnyRouter,
): void {
  const hasRoutes = hasNoSsrRoutes(router)

  // Always install the warnHandler in dev mode for data-only/ssr:false routes
  // Vue's app.config.warnHandler intercepts dev warnings BEFORE console.warn
  app.config.warnHandler = (msg, _instance, _trace) => {
    // Suppress hydration mismatch warnings for data-only SSR routes
    if (
      msg.includes('Hydration node mismatch') ||
      msg.includes('Hydration text mismatch') ||
      msg.includes('Hydration children mismatch') ||
      msg.includes('Hydration class mismatch') ||
      msg.includes('Hydration style mismatch') ||
      msg.includes('Hydration attribute mismatch')
    ) {
      // Only suppress if router has data-only/ssr:false routes
      if (hasRoutes || hasNoSsrRoutes(router)) {
        return // Suppress the warning
      }
    }
    // Let other warnings through to console
    console.warn(`[Vue warn]: ${msg}`)
  }
}

/**
 * Vue-specific wrapper for hydrateStart that installs hydration mismatch
 * suppression for routes with ssr: false or ssr: 'data-only' before returning
 */
export async function hydrateStart(): Promise<AnyRouter> {
  const router = await coreHydrateStart()
  // Install console suppression before app.mount() is called
  // This catches the "Hydration completed but contains mismatches" error
  suppressSsrHydrationMismatches(router)
  return router
}
