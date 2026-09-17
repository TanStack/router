import * as Solid from 'solid-js'
import type { AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

/**
 * Match-state transfer over Solid's hydration registry — the bare pairing's
 * native SSR channel (no `__TSR_SSR__` script injection, no router-owned
 * stream protocol). Entries are content-addressed (`tsr:<matchId>`; match
 * ids are deterministic route-id + interpolated params, so both sides
 * derive the same key from the same URL), the identical mechanism
 * solid-query v6 ships query payloads through (`sq:<queryHash>`).
 *
 * Server half: while the render's serialization context is live, the
 * provider writes each settled match's transferable state. Client half: the
 * hydration-claiming boot — matching is synchronous, so the provider primes
 * match state from the registry and commits before rendering, without
 * running loaders or resolving route chunks up front. Route components
 * resolve at the read point under the boundaries the server actually
 * rendered (Solid `lazy` semantics), and staleness rules own any
 * post-hydration refetching.
 *
 * Both halves no-op under TanStack Start: `router.serverSsr` marks the
 * Start contract (`attachRouterServerSsrUtils` / `dehydrate` / `hydrate`),
 * which owns transfer there — and a Start-hydrated router reaches the
 * client boot with matches already committed, which skips it.
 */
export const MATCH_KEY_PREFIX = 'tsr:'

/** The slice of a match that transfers; mirrors the single-flight match
 * shape (`createSolidStartFlightMatch`) — state, not identity: the client
 * re-derives identity by matching, then merges this in. */
interface TransferredMatch {
  status: AnyRouteMatch['status']
  updatedAt: number
  loaderData?: unknown
  error?: unknown
  notFound?: true
  beforeLoadContext?: Record<string, unknown>
  ssr?: AnyRouteMatch['ssr']
}

type MatchWithBeforeLoadContext = AnyRouteMatch & {
  __beforeLoadContext?: Record<string, unknown>
}

interface SerializationContext {
  noHydrate?: boolean
  serialize: (key: string, value: unknown) => void
}

export function serializeMatchTransfer(router: AnyRouter): void {
  if (router.serverSsr) return
  const ctx = (
    Solid.sharedConfig as unknown as { context?: SerializationContext }
  ).context
  if (!ctx || typeof ctx.serialize !== 'function' || ctx.noHydrate) return

  for (const match of router.stores.matches.get()) {
    // Pending matches are skipped, not deferred: this core has no per-match
    // settle promise to hand seroval, so promise-valued entries (streaming
    // SSR, loaders landing after first flush) need a dispatch-time hook —
    // the next increment. A missing entry makes the client boot fall
    // through to today's behavior rather than half-prime.
    if (match.status === 'pending') continue
    const entry: TransferredMatch = {
      status: match.status,
      updatedAt: match.updatedAt,
    }
    if (match.loaderData !== undefined) entry.loaderData = match.loaderData
    if (match.error !== undefined) entry.error = match.error
    if (match._notFound) entry.notFound = true
    const beforeLoadContext = (match as MatchWithBeforeLoadContext)
      .__beforeLoadContext
    if (beforeLoadContext !== undefined)
      entry.beforeLoadContext = beforeLoadContext
    if (match.ssr !== undefined) entry.ssr = match.ssr
    ctx.serialize(MATCH_KEY_PREFIX + match.id, entry)
  }
}

/**
 * The hydration-claiming boot. Returns true when every synchronously
 * matched route found its registry entry and the matches were committed;
 * false falls back to the caller's existing behavior (no entries — a
 * non-registry server, `noHydrate`, or a pending match the server skipped).
 *
 * Reads the raw registry rather than sharedConfig's accessors: entries
 * arrive as inline scripts that execute at document parse, so they are
 * complete before any client code runs — and the boot must commit BEFORE
 * the hydration render (store writes inside it are owned-scope writes).
 */
export function primeRouterFromRegistry(router: AnyRouter): boolean {
  if (router.stores.matches.get().length > 0) return false
  const registry = (
    globalThis as unknown as { _$HY?: { r: Record<string, unknown> } }
  )._$HY?.r
  if (!registry) return false
  // A page with no match entries (SPA, or Start's own channel) skips before
  // paying for a match pass.
  let hasMatchEntries = false
  for (const key in registry) {
    if (key.startsWith(MATCH_KEY_PREFIX)) {
      hasMatchEntries = true
      break
    }
  }
  if (!hasMatchEntries) return false

  const matches = router.matchRoutes(router.latestLocation)
  if (matches.length === 0) return false

  const primed: Array<AnyRouteMatch> = []
  for (const match of matches) {
    const key = MATCH_KEY_PREFIX + match.id
    if (!(key in registry)) return false
    const raw = registry[key] as
      | TransferredMatch
      | { s: number; v?: TransferredMatch }
      | null
    delete registry[key]
    // Settled serialization refs are stamped `s`/`v`; sync-serialized
    // entries are the value itself.
    const entry =
      raw != null && typeof raw === 'object' && 's' in raw && raw.s === 1
        ? raw.v
        : (raw as TransferredMatch | null)
    if (!entry || typeof entry.status !== 'string') return false
    primed.push(applyTransferredMatch(match, entry))
  }

  // Commit the way the single-flight client publishes hydrated matches.
  router._committed = primed
  router.batch(() => {
    router.stores.setMatches(primed)
    router.stores.status.set('idle')
    router.stores.resolvedLocation.set(router.stores.location.get())
  })
  return true
}

function applyTransferredMatch(
  match: AnyRouteMatch,
  entry: TransferredMatch,
): AnyRouteMatch {
  const next = {
    ...match,
    status: entry.status,
    updatedAt: entry.updatedAt,
    error: entry.error,
    invalid: false,
    isFetching: false,
    preload: false,
    _notFound: entry.notFound,
  } as AnyRouteMatch
  if ('loaderData' in entry) next.loaderData = entry.loaderData
  if ('beforeLoadContext' in entry) {
    ;(next as MatchWithBeforeLoadContext).__beforeLoadContext =
      entry.beforeLoadContext
    next.context = {
      ...next.context,
      ...entry.beforeLoadContext,
    }
  }
  if ('ssr' in entry) next.ssr = entry.ssr
  return next
}
