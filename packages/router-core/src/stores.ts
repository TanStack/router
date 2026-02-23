import { arraysEqual, last } from './utils'

import type { AnyRoute } from './route'
import type { RouterState } from './router'
import type { FullSearchSchema } from './routeInfo'
import type { ParsedLocation } from './location'
import type { AnyRedirect } from './redirect'
import type { AnyRouteMatch } from './Matches'

export interface RouterReadableStore<TValue> {
  readonly state: TValue
}

export interface RouterWritableStore<
  TValue,
> extends RouterReadableStore<TValue> {
  setState: (updater: (prev: TValue) => TValue) => void
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
type MatchStoreLookup = Record<string, MatchStore>
type ReadableStore<TValue> = RouterReadableStore<TValue>

/** SSR non-reactive createMutableStore */
export function createNonReactiveMutableStore<TValue>(
  initialValue: TValue,
): RouterWritableStore<TValue> {
  let value = initialValue

  return {
    get state() {
      return value
    },
    setState(updater: (prev: TValue) => TValue) {
      value = updater(value)
    },
  }
}

/** SSR non-reactive createReadonlyStore */
export function createNonReactiveReadonlyStore<TValue>(
  read: () => TValue,
): RouterReadableStore<TValue> {
  return {
    get state() {
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
  pendingMatchesId: RouterWritableStore<Array<string>>
  /** @internal */
  cachedMatchesId: RouterWritableStore<Array<string>>
  /** store of stores */
  byId: RouterReadableStore<MatchStoreLookup>
  /** store of stores */
  byRouteId: RouterReadableStore<MatchStoreLookup>
  /** store of stores, solid/vue only */
  pendingByRouteId: RouterReadableStore<MatchStoreLookup>
  activeMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  pendingMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  cachedMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  firstMatchId: ReadableStore<string | undefined>
  /** could be react/vue only, the only use inside router-core/router could easily be removed */
  lastMatchId: ReadableStore<string | undefined>
  hasPendingMatches: ReadableStore<boolean>
  matchRouteReactivity: ReadableStore<{
    locationHref: string
    resolvedLocationHref: string | undefined
    status: RouterState<TRouteTree>['status']
  }>
  __store: RouterReadableStore<RouterState<TRouteTree>>

  activeMatchStoresById: Map<string, MatchStore>
  pendingMatchStoresById: Map<string, MatchStore>
  cachedMatchStoresById: Map<string, MatchStore>

  setActiveMatches: (nextMatches: Array<AnyRouteMatch>) => void
  setPendingMatches: (nextMatches: Array<AnyRouteMatch>) => void
  setCachedMatches: (nextMatches: Array<AnyRouteMatch>) => void
}

export function createRouterStores<TRouteTree extends AnyRoute>(
  initialState: RouterState<TRouteTree>,
  config: StoreConfig,
): RouterStores<TRouteTree> {
  const { createMutableStore, createReadonlyStore, batch, init } = config

  // non reactive utilities
  const activeMatchStoresById = new Map<string, MatchStore>()
  const pendingMatchStoresById = new Map<string, MatchStore>()
  const cachedMatchStoresById = new Map<string, MatchStore>()

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
  const pendingMatchesId = createMutableStore<Array<string>>([])
  const cachedMatchesId = createMutableStore<Array<string>>([])

  // 1st order derived stores
  const byId = createReadonlyStore(() =>
    readPoolLookup(activeMatchStoresById, matchesId.state),
  )
  const byRouteId = createReadonlyStore(() =>
    readPoolLookupByRouteId(activeMatchStoresById, matchesId.state),
  )
  const pendingByRouteId = createReadonlyStore(() =>
    readPoolLookupByRouteId(pendingMatchStoresById, pendingMatchesId.state),
  )
  const activeMatchesSnapshot = createReadonlyStore(() =>
    readPoolMatches(activeMatchStoresById, matchesId.state),
  )
  const pendingMatchesSnapshot = createReadonlyStore(() =>
    readPoolMatches(pendingMatchStoresById, pendingMatchesId.state),
  )
  const cachedMatchesSnapshot = createReadonlyStore(() =>
    readPoolMatches(cachedMatchStoresById, cachedMatchesId.state),
  )
  const firstMatchId = createReadonlyStore(() => matchesId.state[0])
  const lastMatchId = createReadonlyStore(() => last(matchesId.state))
  const hasPendingMatches = createReadonlyStore(() =>
    matchesId.state.some((matchId) => {
      const store = activeMatchStoresById.get(matchId)
      return store?.state.status === 'pending'
    }),
  )
  const matchRouteReactivity = createReadonlyStore(() => ({
    locationHref: location.state.href,
    resolvedLocationHref: resolvedLocation.state?.href,
    status: status.state,
  }))

  // compatibility "big" state store
  const __store = createReadonlyStore(() => ({
    status: status.state,
    loadedAt: loadedAt.state,
    isLoading: isLoading.state,
    isTransitioning: isTransitioning.state,
    matches: activeMatchesSnapshot.state,
    location: location.state,
    resolvedLocation: resolvedLocation.state,
    statusCode: statusCode.state,
    redirect: redirect.state,
  }))

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
    pendingMatchesId,
    cachedMatchesId,
    byId,
    byRouteId,
    pendingByRouteId,

    // derived
    activeMatchesSnapshot,
    pendingMatchesSnapshot,
    cachedMatchesSnapshot,
    firstMatchId,
    lastMatchId,
    hasPendingMatches,
    matchRouteReactivity,

    // non-reactive state
    activeMatchStoresById,
    pendingMatchStoresById,
    cachedMatchStoresById,

    // compatibility "big" state
    __store,

    // methods
    setActiveMatches,
    setPendingMatches,
    setCachedMatches,
  }

  // initialize the active matches
  setActiveMatches(initialState.matches as Array<AnyRouteMatch>)
  init?.(store)

  // setters to update non-reactive utilities in sync with the reactive stores
  function setActiveMatches(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      activeMatchStoresById,
      matchesId,
      createMutableStore,
      batch,
    )
  }

  function setPendingMatches(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      pendingMatchStoresById,
      pendingMatchesId,
      createMutableStore,
      batch,
    )
  }

  function setCachedMatches(nextMatches: Array<AnyRouteMatch>) {
    reconcileMatchPool(
      nextMatches,
      cachedMatchStoresById,
      cachedMatchesId,
      createMutableStore,
      batch,
    )
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
      matches.push(matchStore.state)
    }
  }
  return matches
}

function readPoolLookup(
  pool: Map<string, MatchStore>,
  ids: Array<string>,
): MatchStoreLookup {
  const lookup: MatchStoreLookup = {}
  for (const id of ids) {
    const matchStore = pool.get(id)
    if (matchStore) {
      lookup[id] = matchStore
    }
  }
  return lookup
}

function readPoolLookupByRouteId(
  pool: Map<string, MatchStore>,
  ids: Array<string>,
): MatchStoreLookup {
  const lookup: MatchStoreLookup = {}
  for (const id of ids) {
    const matchStore = pool.get(id)
    if (matchStore) {
      const routeId = matchStore.routeId
      if (routeId) {
        lookup[routeId] = matchStore
      }
    }
  }
  return lookup
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
      if (existing.state !== nextMatch) {
        existing.setState(() => nextMatch)
      }
    }

    if (!arraysEqual(idStore.state, nextIds)) {
      idStore.setState(() => nextIds)
    }
  })
}
