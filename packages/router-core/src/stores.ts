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

export interface RouterWritableStore<TValue>
  extends RouterReadableStore<TValue> {
  setState: (updater: (prev: TValue) => TValue) => void
}

export type RouterBatchFn = <TValue>(fn: () => TValue) => TValue

export type MutableStoreFactory = <TValue>(
  initialValue: TValue,
) => RouterWritableStore<TValue>

export type ReadonlyStoreFactory = <TValue>(
  read: () => TValue,
) => RouterReadableStore<TValue>

export interface RouterStoreConfig {
  createMutableStore: MutableStoreFactory
  createReadonlyStore: ReadonlyStoreFactory
  batch: RouterBatchFn
}

export interface RouterStoresBundle<TRouteTree extends AnyRoute> {
  stores: RouterStores<TRouteTree>
  batch: RouterBatchFn
}

export interface RouterStoresFactory {
  createRouterStores: <TRouteTree extends AnyRoute>(
    initialState: RouterState<TRouteTree>,
    opts: {
      isServer: boolean
    },
  ) => RouterStoresBundle<TRouteTree>
}

type MatchStore = RouterWritableStore<AnyRouteMatch>
type MatchStoreLookup = Record<string, MatchStore>
type ReadableStore<TValue> = RouterReadableStore<TValue>

function createLightweightMutableStore<TValue>(
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

function createLightweightReadonlyStore<TValue>(
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
  byId: RouterWritableStore<MatchStoreLookup>
  /** store of stores */
  byRouteId: RouterWritableStore<MatchStoreLookup>
  /** store of stores */
  pendingByRouteId: RouterWritableStore<MatchStoreLookup>
  activeMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  pendingMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  cachedMatchesSnapshot: ReadableStore<Array<AnyRouteMatch>>
  firstMatchId: ReadableStore<string | undefined>
  lastMatchId: ReadableStore<string | undefined>
  /* vue only */
  lastMatchRouteFullPath: ReadableStore<string | undefined>
  hasPendingMatches: ReadableStore<boolean>
  matchRouteReactivity: ReadableStore<{
    locationHref: string
    resolvedLocationHref: string | undefined
    status: RouterState<TRouteTree>['status']
  }>
  __store: RouterReadableStore<RouterState<TRouteTree>>

  /** @internal */
  activeMatchStoresById: Map<string, MatchStore>
  /** @internal */
  pendingMatchStoresById: Map<string, MatchStore>
  /** @internal */
  cachedMatchStoresById: Map<string, MatchStore>

  setActiveMatches: (nextMatches: Array<AnyRouteMatch>) => void
  setPendingMatches: (nextMatches: Array<AnyRouteMatch>) => void
  setCachedMatches: (nextMatches: Array<AnyRouteMatch>) => void
}

export function createRouterStoresWithConfig<TRouteTree extends AnyRoute>(
  initialState: RouterState<TRouteTree>,
  config: RouterStoreConfig,
): RouterStores<TRouteTree> {
  return createRouterStoresImpl(initialState, config)
}

export function createServerRouterStoresBundle<TRouteTree extends AnyRoute>(
  initialState: RouterState<TRouteTree>,
): RouterStoresBundle<TRouteTree> {
  const batch: RouterBatchFn = (fn) => fn()
  const config: RouterStoreConfig = {
    createMutableStore: createLightweightMutableStore,
    createReadonlyStore: createLightweightReadonlyStore,
    batch,
  }

  return {
    stores: createRouterStoresImpl(initialState, config),
    batch,
  }
}

function createRouterStoresImpl<TRouteTree extends AnyRoute>(
  initialState: RouterState<TRouteTree>,
  config: RouterStoreConfig,
): RouterStores<TRouteTree> {
  const { createMutableStore, createReadonlyStore, batch } = config

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
  const byId = createMutableStore<MatchStoreLookup>({})
  const byRouteId = createMutableStore<MatchStoreLookup>({})
  const pendingByRouteId = createMutableStore<MatchStoreLookup>({})

  // 1st order derived stores
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

  // 2nd order derived stores
  const lastMatchRouteFullPath = createReadonlyStore(() => {
    const id = lastMatchId.state
    if (!id) {
      return undefined
    }
    return activeMatchStoresById.get(id)?.state.fullPath
  })

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

  // initialize the active matches
  setActiveMatches(initialState.matches as Array<AnyRouteMatch>)

  // setters to update non-reactive utilities in sync with the reactive stores
  function setActiveMatches(nextMatches: Array<AnyRouteMatch>) {
    batch(() => {
      const idsChanged = reconcileMatchPool(
        nextMatches,
        activeMatchStoresById,
        matchesId,
        createMutableStore,
        batch,
      )
      if (idsChanged) {
        const nextById: MatchStoreLookup = {}
        const nextByRouteId: MatchStoreLookup = {}

        for (const matchId of matchesId.state) {
          const store = activeMatchStoresById.get(matchId)
          if (!store) return
          nextById[matchId] = store
          nextByRouteId[store.state.routeId] = store
        }
        byId.setState(() => nextById)

        if (!lookupEqual(byRouteId.state, nextByRouteId)) {
          byRouteId.setState(() => nextByRouteId)
        }
      }
    })
  }

  function setPendingMatches(nextMatches: Array<AnyRouteMatch>) {
    batch(() => {
      const idsChanged = reconcileMatchPool(
        nextMatches,
        pendingMatchStoresById,
        pendingMatchesId,
        createMutableStore,
        batch,
      )
      if (idsChanged) {
        const byRouteId: MatchStoreLookup = {}

        for (const matchId of pendingMatchesId.state) {
          const store = pendingMatchStoresById.get(matchId)
          if (!store) return
          byRouteId[store.state.routeId] = store
        }

        if (!lookupEqual(pendingByRouteId.state, byRouteId)) {
          pendingByRouteId.setState(() => byRouteId)
        }
      }
    })
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

  return {
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
    lastMatchRouteFullPath,
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

function reconcileMatchPool(
  nextMatches: Array<AnyRouteMatch>,
  pool: Map<string, MatchStore>,
  idStore: RouterWritableStore<Array<string>>,
  createMutableStore: MutableStoreFactory,
  batch: RouterBatchFn,
): boolean {
  const nextIds = nextMatches.map((d) => d.id)
  const nextIdSet = new Set(nextIds)
  let idsChanged = false

  for (const id of pool.keys()) {
    if (!nextIdSet.has(id)) {
      pool.delete(id)
    }
  }

  batch(() => {
    for (const nextMatch of nextMatches) {
      const existing = pool.get(nextMatch.id)
      if (!existing) {
        pool.set(nextMatch.id, createMutableStore(nextMatch))
        continue
      }

      if (existing.state !== nextMatch) {
        existing.setState(() => nextMatch)
      }
    }

    if (!arraysEqual(idStore.state, nextIds)) {
      idsChanged = true
      idStore.setState(() => nextIds)
    }
  })

  return idsChanged
}

function lookupEqual(a: MatchStoreLookup, b: MatchStoreLookup): boolean {
  if (a === b) return true
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key of aKeys) {
    if (!(key in b) || a[key] !== b[key]) return false
  }
  return true
}
