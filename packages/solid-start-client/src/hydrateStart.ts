import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import { onHydrated } from '@tanstack/solid-router/ssr/client'
import type { AnyRouter } from '@tanstack/router-core'

/**
 * Solid-specific wrapper for hydrateStart that signals hydration completion
 */
export function hydrateStart(): Promise<AnyRouter> {
  return coreHydrateStart().finally(onHydrated)
}
