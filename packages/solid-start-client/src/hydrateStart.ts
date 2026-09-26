import { hydrateStart as coreHydrateStart } from '@tanstack/start-client-core/client'
import {
  installRouterPayloadShim,
  readRouterPayloadFromAdapters,
} from '@tanstack/solid-router/ssr/client'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'

// window.__TSS_START_OPTIONS__ is declared globally by start-client-core's
// internal global.ts, which is not part of its public type surface.
declare global {
  interface Window {
    __TSS_START_OPTIONS__?: {
      serializationAdapters?: Array<AnySerializationAdapter>
    }
  }
}

/**
 * Solid-specific wrapper for hydrateStart. The SSR payload arrives through
 * Solid's JSON codec (the `__TSR_P` record queue) instead of the `$_TSR`
 * script channel, so a synthetic `$_TSR` is installed for the unchanged core
 * hydrate to read.
 *
 * Ordering: core hydrateStart creates the router and finalizes the merged
 * serialization adapter list — mutating the same array it exposes as
 * `window.__TSS_START_OPTIONS__.serializationAdapters` — BEFORE calling core
 * `hydrate()`, whose final bootstrap read (`$_TSR.router`) triggers the
 * shim's lazy decode. Reading the adapters from that global at decode time
 * therefore observes the exact list the server encoded with, without needing
 * the router instance the core sequence keeps internal.
 *
 * The shim's promise resolves once the (lazily loaded) payload decoder is
 * ready; core hydrateStart runs after it. The trailing `$_TSR?.h()` signals
 * hydration complete — the synthetic deletes itself (keeping
 * `typeof window.$_TSR === 'undefined'` a valid hydration probe); a real
 * bootstrap (script-channel server) runs its own teardown.
 */
export function hydrateStart(): Promise<AnyRouter> {
  return installRouterPayloadShim(() =>
    readRouterPayloadFromAdapters(
      window.__TSS_START_OPTIONS__?.serializationAdapters,
    ),
  )
    .then(() => coreHydrateStart())
    .finally(() => window.$_TSR?.h())
}
