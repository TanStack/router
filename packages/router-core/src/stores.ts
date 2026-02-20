import { createStore } from "@tanstack/store"
import { batch } from "./utils/batch"
import { arraysEqual, last } from "./utils"

import type { AnyRoute } from "./route"
import type { RouterState } from "./router"
import type { FullSearchSchema } from "./routeInfo"
import type { ParsedLocation } from "./location"
import type { AnyRedirect } from "./redirect"
import type { AnyRouteMatch } from "./Matches"
import type { Store } from "@tanstack/store"

type MatchStore = Store<AnyRouteMatch>
type MatchStoreLookup = Record<string, MatchStore>
type ReadableStore<TValue> = Pick<Store<TValue>, 'state' | 'get' | 'subscribe'>

export interface RouterStores<
  in out TRouteTree extends AnyRoute
> {
  status: Store<RouterState<TRouteTree>['status']>
  loadedAt: Store<number>
  isLoading: Store<boolean>
  isTransitioning: Store<boolean>
  location: Store<ParsedLocation<FullSearchSchema<TRouteTree>>>
  resolvedLocation: Store<
    ParsedLocation<FullSearchSchema<TRouteTree>> | undefined
  >
  statusCode: Store<number>
  redirect: Store<AnyRedirect | undefined>
  matchesId: Store<Array<string>>
  pendingMatchesId: Store<Array<string>>
  /** @internal */
  cachedMatchesId: Store<Array<string>>
  /** store of stores */
  byId: Store<MatchStoreLookup>
  /** store of stores */
  byRouteId: Store<MatchStoreLookup>
  /** store of stores */
  pendingByRouteId: Store<MatchStoreLookup>
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
  __store: Store<RouterState<TRouteTree>>

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

/**
 * TODO:
 * 1. remove reactivity during SSR using isServer gate. This includes `createStore` and all setState calls, `batch`, `useStore`.
 * 2. externalize the store setup to a separate function so most it is isolated, attach to router on a `_stores` key.
 * 3. investigate whether we could use a ≠ signal graph for each adapter: that externalized function (see 2) could be called by the `createRouter` of each adapter (thus could be different in each), and then Solid could actually use its native signals.
 */
export function createRouterStores<
  TRouteTree extends AnyRoute
>(
  initialState: RouterState<TRouteTree>,
): RouterStores<TRouteTree> {
  // non reactive utilities
  const activeMatchStoresById = new Map<string, MatchStore>()
  const pendingMatchStoresById = new Map<string, MatchStore>()
  const cachedMatchStoresById = new Map<string, MatchStore>()

  // atoms
  const status = createStore(initialState.status)
  const loadedAt = createStore(initialState.loadedAt)
  const isLoading = createStore(initialState.isLoading)
  const isTransitioning = createStore(initialState.isTransitioning)
  const location = createStore(initialState.location)
  const resolvedLocation = createStore(initialState.resolvedLocation)
  const statusCode = createStore(initialState.statusCode)
  const redirect = createStore(initialState.redirect)
  const matchesId = createStore<Array<string>>([])
  const pendingMatchesId = createStore<Array<string>>([])
  const cachedMatchesId = createStore<Array<string>>([])
  const byId = createStore<MatchStoreLookup>({})
  const byRouteId = createStore<MatchStoreLookup>({})
  const pendingByRouteId = createStore<MatchStoreLookup>({})

  // 1st order derived stores
  const activeMatchesSnapshot = createStore(() =>
    readPoolMatches(
      activeMatchStoresById,
      matchesId.state,
    ),
  )
  const pendingMatchesSnapshot = createStore(() =>
    readPoolMatches(
      pendingMatchStoresById,
      pendingMatchesId.state,
    ),
  )
  const cachedMatchesSnapshot = createStore(() =>
    readPoolMatches(
      cachedMatchStoresById,
      cachedMatchesId.state,
    ),
  )
  const firstMatchId = createStore(() => matchesId.state[0])
  const lastMatchId = createStore(() => last(matchesId.state))
  const hasPendingMatches = createStore(() =>
    matchesId.state.some((matchId) => {
      const store = activeMatchStoresById.get(matchId)
      return store?.state.status === 'pending'
    }),
  )
  const matchRouteReactivity = createStore(() => ({
    locationHref: location.state.href,
    resolvedLocationHref: resolvedLocation.state?.href,
    status: status.state,
  }))

  // 2nd order derived stores
  const lastMatchRouteFullPath = createStore(() => {
    const id = lastMatchId.state
    if (!id) {
      return undefined
    }
    return activeMatchStoresById.get(id)?.state.fullPath
  })

  // compatibility "big" state store
  // behaves like a regular subscribable, reactive store
  // but is 2nd order derived, and updates the atoms in its setState
  const compatState = createStore(() => ({
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
  const __store = {
    get state() {
      return compatState.state
    },
    get() {
      return compatState.state
    },
    setState: (updater) => {
      const nextState = updater(compatState.state)
      batch(() => {
        status.setState(() => nextState.status)
        loadedAt.setState(() => nextState.loadedAt)
        isLoading.setState(() => nextState.isLoading)
        isTransitioning.setState(() => nextState.isTransitioning)
        location.setState(() => nextState.location)
        resolvedLocation.setState(() => nextState.resolvedLocation)
        statusCode.setState(() => nextState.statusCode)
        redirect.setState(() => nextState.redirect)
        setActiveMatches(nextState.matches)
      })
    },
    subscribe: (observerOrFn) => compatState.subscribe(observerOrFn),
  } as Store<RouterState<TRouteTree>>

  // initialize the active matches
  setActiveMatches(initialState.matches as Array<AnyRouteMatch>)

  // setters to update non-reactive utilities in sync with the reactive stores
  function setActiveMatches(nextMatches: Array<AnyRouteMatch>) {
    batch(() => {
      const idsChanged = reconcileMatchPool(
        nextMatches,
        activeMatchStoresById,
        matchesId,
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
  idStore: Store<Array<string>>,
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
        pool.set(nextMatch.id, createStore(nextMatch))
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