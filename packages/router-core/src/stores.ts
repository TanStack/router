import { isServer } from '@tanstack/router-core/isServer'
import { arraysEqual, functionalUpdate } from './utils'
import { rootRouteId } from './root'

import type { AnyRoute } from './route'
import type { AnyRouter, RouterCore, RouterState } from './router'
import type { FullSearchSchema } from './routeInfo'
import type { ParsedLocation } from './location'
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
}

// One presented visit owns the source and its framework-neutral context.
export type RouterPresentationSource = readonly [
  router: AnyRouter,
  location?: RouterWritableStore<ParsedLocation<any>>,
  routeId?: string,
]

type MatchStore = RouterWritableStore<AnyRouteMatch | undefined> & {
  location?: RouterPresentationSource
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
  location: RouterWritableStore<ParsedLocation<FullSearchSchema<TRouteTree>>>
  locationSource: RouterPresentationSource
  resolvedLocation: RouterWritableStore<
    ParsedLocation<FullSearchSchema<TRouteTree>> | undefined
  >
  /** Canonical published membership; `ids` is its framework-reactive projection. */
  presentationIds: Array<string>
  ids: RouterWritableStore<Array<string>>
  matches: ReadableStore<Array<AnyRouteMatch>>
  __store: RouterReadableStore<RouterState<TRouteTree>>

  byRoute: Map<string, MatchStore>

  /**
   * Get the stable atom for a route's presented match. The atom remains in the
   * pool when the route leaves and contains `undefined` until it re-enters.
   */
  getMatchStore: (
    routeId: string,
  ) => RouterReadableStore<AnyRouteMatch | undefined> &
    Pick<MatchStore, 'location'>

  setMatches: (
    nextMatches: Array<AnyRouteMatch>,
    presentationLocation?: ParsedLocation<any>,
  ) => void
}

export function createRouterStores<TRouteTree extends AnyRoute>(
  router: RouterCore<TRouteTree, any, any, any, any>,
  config: StoreConfig,
): RouterStores<TRouteTree> {
  const initialLocation = router.latestLocation
  const { createMutableStore, createReadonlyStore, batch } = config

  // non reactive utilities
  const byRoute = new Map<string, MatchStore>()

  // atoms
  const status = createMutableStore<RouterState<TRouteTree>['status']>('idle')
  const location = createMutableStore(initialLocation)
  const locationSource: RouterPresentationSource = [router, location]
  const resolvedLocation =
    createMutableStore<RouterState<TRouteTree>['resolvedLocation']>(undefined)
  const ids = createMutableStore<Array<string>>([])

  // 1st order derived stores
  const matches = createReadonlyStore(() =>
    ids.get().map((id) => byRoute.get(id)!.get()!),
  )

  // compatibility "big" state store
  const __store = createReadonlyStore(() => ({
    status: status.get(),
    isLoading: status.get() === 'pending',
    matches: matches.get(),
    location: location.get(),
    resolvedLocation: resolvedLocation.get(),
  }))

  function getMatchStore(routeId: string): MatchStore {
    let matchStore = byRoute.get(routeId)
    if (!matchStore) {
      matchStore = createMutableStore<AnyRouteMatch | undefined>(undefined)
      byRoute.set(routeId, matchStore)
    }
    return matchStore
  }

  const store = {
    // atoms
    status,
    location,
    locationSource,
    resolvedLocation,
    presentationIds: ids.get(),
    ids,

    // derived
    matches,

    // non-reactive state
    byRoute,

    // compatibility "big" state
    __store,

    // stable per-route presentation atoms
    getMatchStore,

    // methods
    setMatches,
  }

  // setters to update non-reactive utilities in sync with the reactive stores
  function setMatches(
    nextMatches: Array<AnyRouteMatch>,
    presentationLocation: ParsedLocation<any> = location.get(),
  ) {
    const previousIds = store.presentationIds
    const nextIds = nextMatches.map((match) => match.routeId)

    batch(() => {
      // Native transitions can stage `ids` while plain visit ownership advances.
      store.presentationIds = nextIds
      // Publish lane membership first so framework trees reconcile departures
      // before observers of a leaving route receive its tombstone.
      if (!arraysEqual(previousIds, nextIds)) {
        ids.set(nextIds)
      }

      for (const id of previousIds) {
        if (!nextIds.includes(id)) {
          delete byRoute.get(id)!.location
          byRoute.get(id)!.set(() => undefined)
        }
      }

      for (const nextMatch of nextMatches) {
        const matchStore = getMatchStore(nextMatch.routeId)
        // The pooled match handle must not retain a departed visit's source.
        // Suspended framework trees keep the source itself in their context.
        matchStore.location ||= [
          router,
          (isServer ?? router.isServer)
            ? undefined
            : nextMatch.routeId === rootRouteId
              ? location
              : createMutableStore(presentationLocation),
          nextMatch.routeId,
        ]
        if (matchStore.get() !== nextMatch) {
          matchStore.set(nextMatch)
        }
      }
    })
  }

  return store
}
