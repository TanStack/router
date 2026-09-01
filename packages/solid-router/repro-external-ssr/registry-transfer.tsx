// Phase 1 spike: match-state transfer over Solid's hydration registry.
//
// Server half: while the render's serialization context is live, write each
// match's transferable state content-addressed (`tsr:<matchId>` — match ids
// are deterministic route-id + interpolated-params, so both sides derive
// the same key from the same URL). This is the identical mechanism
// solid-query's provider ships queries through (`sq:<queryHash>` keys via
// sharedConfig.context.serialize) — no `__TSR_SSR__` script injection, no
// router-owned stream channel.
//
// Client half: the hydration-claiming boot. Matching is synchronous, so the
// client matches, primes each match from its registry entry, and commits —
// no `router.load()` before hydrate, loaders do not re-run, and hydration
// claims the server markup with the same data the server rendered from.
import { sharedConfig } from 'solid-js'
import type { AnyRouteMatch, AnyRouter } from '../src'

export const MATCH_KEY_PREFIX = 'tsr:'

interface TransferredMatch {
  id: string
  status: AnyRouteMatch['status']
  updatedAt: number
  loaderData?: unknown
  error?: unknown
}

// ---- server ----

export function serializeRouterMatches(router: AnyRouter): void {
  const ctx = (
    sharedConfig as unknown as {
      context?: {
        async?: boolean
        noHydrate?: boolean
        serialize: (key: string, value: unknown) => void
      }
    }
  ).context
  if (!ctx || typeof ctx.serialize !== 'function' || ctx.noHydrate) return

  for (const match of router.stores.matches.get()) {
    const entry: TransferredMatch = {
      id: match.id,
      status: match.status,
      updatedAt: match.updatedAt,
    }
    if (match.loaderData !== undefined) entry.loaderData = match.loaderData
    if (match.error !== undefined) entry.error = match.error
    ctx.serialize(MATCH_KEY_PREFIX + match.id, entry)
  }
}

// ---- client ----

export function primeRouterFromRegistry(router: AnyRouter): boolean {
  // The registry entries arrive as inline scripts that execute at document
  // parse, so `_$HY.r` is populated before any client code runs — the boot
  // reads it directly, BEFORE hydrate(): store commits are plain writes
  // here, while inside the hydration render they'd be writes in an owned
  // scope.
  const registry = (globalThis as unknown as { _$HY?: { r: Record<string, any> } })
    ._$HY?.r
  if (!registry) return false

  // Matching is synchronous — no loader dispatch, no chunk resolution.
  const matches = router.matchRoutes(router.latestLocation)

  const primed: Array<AnyRouteMatch> = []
  for (const match of matches) {
    const key = MATCH_KEY_PREFIX + match.id
    if (!(key in registry)) return false
    const raw = registry[key]
    delete registry[key]
    // Settled serialization refs are stamped `s`/`v` (the spike transfers
    // settled matches only; promise-valued entries — pending loaders
    // streaming as they land — are the next step and use the same thenable
    // handling solid-query's read side already has).
    const entry: TransferredMatch =
      raw != null && typeof raw === 'object' && raw.s === 1 ? raw.v : raw
    if (!entry || entry.id !== match.id) return false
    primed.push({
      ...match,
      status: entry.status,
      updatedAt: entry.updatedAt,
      loaderData: entry.loaderData,
      error: entry.error,
      invalid: false,
      isFetching: false,
      preload: false,
    } as AnyRouteMatch)
  }

  // Commit, the way the single-flight client publishes hydrated matches:
  // seed the committed set and stores directly, status idle.
  router._committed = primed
  router.batch(() => {
    router.stores.setMatches(primed)
    router.stores.status.set('idle')
    router.stores.resolvedLocation.set(router.stores.location.get())
  })
  return true
}
