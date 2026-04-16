import { createLRUCache } from './lru-cache'
import { arraysEqual, functionalUpdate } from './utils'

import type { AnyRoute } from './route'
import type { RouterState } from './router'
import type { FullSearchSchema } from './routeInfo'
import type { ParsedLocation } from './location'
import type { AnyRedirect } from './redirect'
import type { AnyRouteMatch } from './Matches'

export interface RouterReadableStore<TValue> {
  get: () => TValue
}

export interface RouterWritableStore<
  TValue,
> extends RouterReadableStore<TValue> {
  set: ((updater: (prev: TValue) => TValue) => void) & ((value: TValue) => void)
}

export type RouterBatchFn = (fn: () => void) => void

export type MutableStoreFactory = <TValue>(
  initialValue: TValue,
) => RouterWritableStore<TValue>

export type ReadonlyStoreFactory = <TValue>(
  read: () => TValue,
) => RouterReadableStore<TValue>

export type GetStoreConfig = (opts: { isServer?: boolean }) => StoreConfig

export type StoreConfig = {
  createMutableStore: MutableStoreFactory
  createReadonlyStore: ReadonlyStoreFactory
  batch: RouterBatchFn
  init?: (stores: RouterStores<AnyRoute>) => void
}

type MatchStore = RouterWritableStore<AnyRouteMatch> & {
  routeId?: string
}
type ReadableStore<TValue> = RouterReadableStore<TValue>

/** SSR non-reactive createMutableStore */
export function createNonReactiveMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  let value = initialValue

  return {
    get() {
      return value
    },
    set(nextOrUpdater: TValue | ((prev: TValue) => TValue)) {
      value = functionalUpdate(nextOrUpdater, value)
    },
  }
}

/** SSR non-reactive createReadonlyStore */
export function createNonReactiveReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  return {
    get() {
      return read()
    },
  }
}

export interface RouterStores<in out TRouteTree extends AnyRoute> {
  status: RouterWritableStore<RouterState<TRouteTree>['status']>
  loadedAt: RouterWritableStore<number>
  isLoading: RouterWritableStore<boolean>
  isTransitioning: RouterWritableStore<boolean>
  location: RouterWritableStore<ParsedLocation<FullSearchSchema<TRouteTree>>>
  resolvedLocation: RouterWritableStore<
    ParsedLocation<FullSearchSchema<TRouteTree>> | undefined
  >
  statusCode: RouterWritableStore<number>
  redirect: RouterWritableStore<AnyRedirect | undefined>
  matchesId: RouterWritableStore<Array<string>>
  pendingIds: RouterWritableStore<Array<string>>
  /** @internal */
  cachedIds: RouterWritableStore<Array<string>>
  matches: ReadableStore<Array<AnyRouteMatch>>
  pendingMatches: ReadableStore<Array<AnyRouteMatch>>
  cachedMatches: ReadableStore<Array<AnyRouteMatch>>
  firstId: ReadableStore<string | undefined>
  hasPending: ReadableStore<boolean>
  matchRouteDeps: ReadableStore<{
    locationHref: string
    resolvedLocationHref: string | undefined
    status: RouterState<TRouteTree>['status']
  }>
  __store: RouterReadableStore<RouterState<TRouteTree>>

  matchStores: Map<string, MatchStore>
  pendingMatchStores: Map<string, MatchStore>
  cachedMatchStores: Map<string, MatchStore>

  /**
   * Get a computed store that resolves a routeId to its current match state.
   * Returns the same cached store instance for repeated calls with the same key.
   * The computed depends on matchesId + the individual match store, so
   * subscribers are only notified when the resolved match state changes.
   */
  getRouteMatchStore: (
    routeId: string,
  ) => RouterReadableStore<AnyRouteMatch | undefined>

  setMatches: (nextMatches: Array<AnyRouteMatch>) => void
  setPending: (nextMatches: Array<AnyRouteMatch>) => void
  setCached: (nextMatches: Array<AnyRouteMatch>) => void
  /**
   * Atomically promote the pending pool into the active pool and clear pending.
   *
   * Unlike `setMatches(pendingMatches) + setPending([])`, which snapshots match
   * values out of the pending stores and creates fresh stores in the active
   * pool, this preserves store identity: the pending store becomes the active
   * store. That ensures any writes that happened to the pending store are
   * visible in the active pool (no drift from stale snapshots), and reactive
   * subscribers on the pending store continue to work after promotion.
   *
   * `nextMatches` is the list of match values to commit (typically
   * `pendingMatches.get()`). Only ids present in the existing pending pool are
   * transferred — any id not already in the pending pool falls back to the
   * plain `setMatches` path for that id.
   */
  commitPending: (nextMatches: Array<AnyRouteMatch>) => void
}

export function createRouterStores<TRouteTree extends AnyRoute>(
  initialState: RouterState<TRouteTree>,
  config: StoreConfig,
): RouterStores<TRouteTree> {
  const { createMutableStore, createReadonlyStore, batch, init } = config

  // non reactive utilities
  const matchStores = new Map<string, MatchStore>()
  const pendingMatchStores = new Map<string, MatchStore>()
  const cachedMatchStores = new Map<string, MatchStore>()

  // atoms
  const status = createMutableStore(initialState.status)
  const loadedAt = createMutableStore(initialState.loadedAt)
  const isLoading = createMutableStore(initialState.isLoading)
  const isTransitioning = createMutableStore(initialState.isTransitioning)
  const location = createMutableStore(initialState.location)
  const resolvedLocation = createMutableStore(initialState.resolvedLocation)
  const statusCode = createMutableStore(initialState.statusCode)
  const redirect = createMutableStore(initialState.redirect)
  const matchesId = createMutableStore<Array<string>>([])
  const pendingIds = createMutableStore<Array<string>>([])
  const cachedIds = createMutableStore<Array<string>>([])

  // 1st order derived stores
  const matches = createReadonlyStore(() =>
    readPoolMatches(matchStores, matchesId.get()),
  )
  const pendingMatches = createReadonlyStore(() =>
    readPoolMatches(pendingMatchStores, pendingIds.get()),
  )
  const cachedMatches = createReadonlyStore(() =>
    readPoolMatches(cachedMatchStores, cachedIds.get()),
  )
  const firstId = createReadonlyStore(() => matchesId.get()[0])
  // `hasPending` gates `onResolved` / `onBeforeRouteMount` in the framework
  // Transitioners. It is true whenever navigation is still in-flight:
  //   1) the pending pool is non-empty (a navigation is being loaded), or
  //   2) an already-committed active match is still `status: 'pending'`
  //      (e.g. `pendingMs` elapsed and we committed before the loader
  //      resolved).
  // Reading the pending pool — and not only the active pool — avoids the
  // failure mode where an active match's status is stuck on `'pending'` but
  // the pending pool is empty, which previously left `hasPending` pinned to
  // `true` and blocked `onResolved` from ever firing.
  const hasPending = createReadonlyStore(() => {
    if (pendingIds.get().length > 0) {
      return true
    }
    return matchesId.get().some((matchId) => {
      const store = matchStores.get(matchId)
      return store?.get().status === 'pending'
    })
  })
  const matchRouteDeps = createReadonlyStore(() => ({
    locationHref: location.get().href,
    resolvedLocationHref: resolvedLocation.get()?.href,
    status: status.get(),
  }))

  // compatibility "big" state store
  const __store = createReadonlyStore(() => ({
    status: status.get(),
    loadedAt: loadedAt.get(),
    isLoading: isLoading.get(),
    isTransitioning: isTransitioning.get(),
    matches: matches.get(),
    location: location.get(),
    resolvedLocation: resolvedLocation.get(),
    statusCode: statusCode.get(),
    redirect: redirect.get(),
  }))

  // Per-routeId computed store cache.
  // Each entry resolves routeId → match state through the signal graph,
  // giving consumers a single store to subscribe to instead of the
  // two-level byRouteId → matchStore pattern.
  //
  // 64 max size is arbitrary, this is only for active matches anyway so
  // it should be plenty. And we already have a 32 limit due to route
  // matching bitmask anyway.
  const matchStoreByRouteIdCache = createLRUCache<
    string,
    RouterReadableStore<AnyRouteMatch | undefined>
  >(64)

  function getRouteMatchStore(
    routeId: string,
  ): RouterReadableStore<AnyRouteMatch | undefined> {
    let cached = matchStoreByRouteIdCache.get(routeId)
    if (!cached) {
      cached = createReadonlyStore(() => {
        // Reading matchesId.get() tracks it as a dependency.
        // When matchesId changes (navigation), this computed re-evaluates.
        const ids = matchesId.get()
        for (const id of ids) {
          const matchStore = matchStores.get(id)
          if (matchStore && matchStore.routeId === routeId) {
            // Reading matchStore.get() tracks it as a dependency.
            // When the match store's state changes, this re-evaluates.
            return matchStore.get()
          }
        }
        return undefined
      })
      matchStoreByRouteIdCache.set(routeId, cached)
    }
    return cached
  }

  const store = {
    // atoms
    status,
    loadedAt,
    isLoading,
    isTransitioning,
    location,
    resolvedLocation,
    statusCode,
    redirect,
    matchesId,
    pendingIds,
    cachedIds,

    // derived
    matches,
    pendingMatches,
    cachedMatches,
    firstId,
    hasPending,
    matchRouteDeps,

    // non-reactive state
    matchStores,
    pendingMatchStores,
    cachedMatchStores,

    // compatibility "big" state
    __store,

    // per-key computed stores
    getRouteMatchStore,

    // methods
    setMatches,
    setPending,
    setCached,
    commitPending,
  }

  // initialize the active matches
  setMatches(initialState.matches as Array<AnyRouteMatch>)
  init?.(store)

  // setters to update non-reactive utilities in sync with the reactive stores
  function setMatches(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      matchStores,
      matchesId,
      createMutableStore,
      batch,
    )
  }

  function setPending(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      pendingMatchStores,
      pendingIds,
      createMutableStore,
      batch,
    )
  }

  function setCached(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      cachedMatchStores,
      cachedIds,
      createMutableStore,
      batch,
    )
  }

  /**
   * Atomically promote the pending pool into the active pool.
   *
   * For each id that exists in both `nextMatches` and the pending pool, the
   * pending store is moved into the active pool (preserving store identity
   * and the latest value). Any remaining entries in the pending pool are
   * cleared. Entries that only live in `nextMatches` (not in the pending
   * pool) get fresh active stores via the regular reconcile path.
   *
   * This avoids a subtle race: with `setMatches(pendingMatches.get()) +
   * setPending([])`, the active pool gets a fresh store initialized from a
   * snapshot value, and any pending-store write that is only observed AFTER
   * the snapshot (e.g. a loader completion that resolves inside a framework
   * transition) is lost when `setPending([])` discards the pending store.
   * Handing off the store itself guarantees those writes remain visible.
   */
  function commitPending(nextMatches: Array<AnyRouteMatch>) {
    const nextIds = nextMatches.map((d) => d.id)
    const nextIdSet = new Set(nextIds)

    batch(() => {
      // Drop active stores whose id isn't in the next commit.
      for (const id of matchStores.keys()) {
        if (!nextIdSet.has(id)) {
          matchStores.delete(id)
        }
      }

      for (const nextMatch of nextMatches) {
        const pendingStore = pendingMatchStores.get(nextMatch.id)
        const existingActive = matchStores.get(nextMatch.id)

        if (pendingStore) {
          // Prefer the pending store's current value over the caller's
          // snapshot — pendingStore.get() reflects any write that landed
          // after the caller read pendingMatches.get().
          const pendingValue = pendingStore.get()
          const latest = pendingValue !== nextMatch ? pendingValue : nextMatch

          if (existingActive && existingActive !== pendingStore) {
            // Active already has a (different) store for this id. Update it
            // in place to preserve its subscribers, then drop the pending
            // store. We do NOT reuse the pending store here because the
            // active store may already have reactive consumers bound to it.
            existingActive.routeId = nextMatch.routeId
            if (existingActive.get() !== latest) {
              existingActive.set(latest)
            }
          } else {
            // Move the pending store into the active pool.
            pendingStore.routeId = nextMatch.routeId
            if (pendingValue !== latest) {
              pendingStore.set(latest)
            }
            matchStores.set(nextMatch.id, pendingStore)
          }

          pendingMatchStores.delete(nextMatch.id)
          continue
        }

        // No pending store for this id — fall back to the regular path.
        if (!existingActive) {
          const matchStore = createMutableStore(nextMatch) as MatchStore
          matchStore.routeId = nextMatch.routeId
          matchStores.set(nextMatch.id, matchStore)
        } else {
          existingActive.routeId = nextMatch.routeId
          if (existingActive.get() !== nextMatch) {
            existingActive.set(nextMatch)
          }
        }
      }

      // Any ids that were in pending but aren't in the commit list are
      // orphans — remove them so the pending pool is fully drained.
      for (const id of pendingMatchStores.keys()) {
        pendingMatchStores.delete(id)
      }

      if (!arraysEqual(matchesId.get(), nextIds)) {
        matchesId.set(nextIds)
      }
      if (pendingIds.get().length !== 0) {
        pendingIds.set([])
      }
    })
  }

  return store
}

function readPoolMatches(
  pool: Map<string, MatchStore>,
  ids: Array<string>,
): Array<AnyRouteMatch> {
  const matches: Array<AnyRouteMatch> = []
  for (const id of ids) {
    const matchStore = pool.get(id)
    if (matchStore) {
      matches.push(matchStore.get())
    }
  }
  return matches
}

function reconcileMatchPool(
  nextMatches: Array<AnyRouteMatch>,
  pool: Map<string, MatchStore>,
  idStore: RouterWritableStore<Array<string>>,
  createMutableStore: MutableStoreFactory,
  batch: RouterBatchFn,
): void {
  const nextIds = nextMatches.map((d) => d.id)
  const nextIdSet = new Set(nextIds)

  batch(() => {
    for (const id of pool.keys()) {
      if (!nextIdSet.has(id)) {
        pool.delete(id)
      }
    }

    for (const nextMatch of nextMatches) {
      const existing = pool.get(nextMatch.id)
      if (!existing) {
        const matchStore = createMutableStore(nextMatch) as MatchStore
        matchStore.routeId = nextMatch.routeId
        pool.set(nextMatch.id, matchStore)
        continue
      }

      existing.routeId = nextMatch.routeId
      if (existing.get() !== nextMatch) {
        existing.set(nextMatch)
      }
    }

    if (!arraysEqual(idStore.get(), nextIds)) {
      idStore.set(nextIds)
    }
  })
}
