import { isServer } from '@tanstack/router-core/isServer'
import { arraysEqual, functionalUpdate } from './utils'
import { removeTrailingSlash } from './path'

import type { AnyRoute } from './route'
import type { AnyRouter, RouterState } from './router'
import type { LoadTransaction } from './load-client'
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

type MatchStore = RouterWritableStore<AnyRouteMatch | undefined>
type ReadableStore<TValue> = RouterReadableStore<TValue>

interface LinkLocationInterest {
  path?: string
  dynamic?: boolean
  owner?: string
}

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
  resolvedLocation: RouterWritableStore<
    ParsedLocation<FullSearchSchema<TRouteTree>> | undefined
  >
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
  ) => RouterReadableStore<AnyRouteMatch | undefined>

  setMatches: (nextMatches: Array<AnyRouteMatch>) => void
  getLinkLocationSnapshot: () => { location: ParsedLocation }
  subscribeLinkLocation: (
    interest: LinkLocationInterest,
    listener: (snapshot: { location: ParsedLocation }) => void,
  ) => { unsubscribe: () => void; update: () => void }
  invalidateLinkLocations: () => void
}

export function createRouterStores<TRouteTree extends AnyRoute>(
  initialLocation: RouterState<TRouteTree>['location'],
  config: StoreConfig,
  getHrefSource: () => readonly [unknown, unknown] | undefined,
  getBasepath: () => string,
  router: AnyRouter,
): RouterStores<TRouteTree> {
  const { createMutableStore, createReadonlyStore, batch } = config

  // non reactive utilities
  const byRoute = new Map<string, MatchStore>()

  // atoms
  const status = createMutableStore<RouterState<TRouteTree>['status']>('idle')
  const location = createMutableStore(initialLocation)
  let linkLocations: ReturnType<typeof createLinkLocationStore> | undefined
  if (!(isServer ?? router.isServer)) {
    linkLocations = createLinkLocationStore(
      location,
      batch,
      getHrefSource,
      getBasepath,
      router,
    )
  }
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

  const store: RouterStores<TRouteTree> = {
    // atoms
    status,
    location,
    resolvedLocation,
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
    getLinkLocationSnapshot: () => linkLocations!.getSnapshot(),
    subscribeLinkLocation: (interest, listener) =>
      linkLocations!.subscribe(interest, listener),
    invalidateLinkLocations: () => linkLocations?.invalidate(),
  }

  // setters to update non-reactive utilities in sync with the reactive stores
  function setMatches(nextMatches: Array<AnyRouteMatch>) {
    const previousIds = ids.get()
    const nextIds = nextMatches.map((match) => match.routeId)

    batch(() => {
      // Publish lane membership first so framework trees reconcile departures
      // before observers of a leaving route receive its tombstone.
      if (!arraysEqual(previousIds, nextIds)) {
        ids.set(nextIds)
      }

      for (const id of previousIds) {
        if (!nextIds.includes(id)) {
          byRoute.get(id)!.set(() => undefined)
        }
      }

      for (const nextMatch of nextMatches) {
        const matchStore = getMatchStore(nextMatch.routeId)
        if (matchStore.get() !== nextMatch) {
          matchStore.set(nextMatch)
        }
      }
    })
  }

  return store
}

function createLinkLocationStore<TRouteTree extends AnyRoute>(
  location: RouterStores<TRouteTree>['location'],
  batch: RouterBatchFn,
  getHrefSource: () => readonly [unknown, unknown] | undefined,
  getBasepath: () => string,
  router: AnyRouter,
) {
  let linkSnapshot = { location: location.get() as ParsedLocation }
  type LinkListener = {
    interest: LinkLocationInterest
    listener: (value: typeof linkSnapshot) => void
    key?: string | null
    version: number
  }
  let links: Set<LinkListener> | undefined
  // The undefined bucket holds links whose destination depends on location.
  let paths: Map<string | undefined, Set<LinkListener>> | undefined
  let hrefSource: ReturnType<typeof getHrefSource>
  let version = 0
  let deferred: Set<LinkListener> | undefined
  let waiting: LoadTransaction | undefined

  function settleDeferred(owner: LoadTransaction) {
    if (waiting !== owner) {
      return
    }
    waiting = undefined
    if (!deferred?.size) {
      return
    }
    linkSnapshot = { location: location.get() }
    const currentVersion = ++version
    const records = [...deferred]
    deferred.clear()
    records.forEach((record) => {
      if (links?.has(record)) {
        notifyLink(record, currentVersion)
      }
    })
  }

  function indexLink(record: LinkListener, remove = false) {
    // null means the link has no location dependency (an external href).
    const key = remove
      ? record.key
      : record.interest.dynamic
        ? undefined
        : (record.interest.path ?? null)
    const bucket = key === null ? undefined : paths!.get(key)
    if (remove) {
      bucket?.delete(record)
      if (key !== null && !bucket?.size) {
        paths!.delete(key)
      }
      return
    }
    record.key = key
    if (key === null) {
      return
    }
    if (bucket) {
      bucket.add(record)
    } else {
      paths!.set(key, new Set([record]))
    }
  }

  function reindexLink(record: LinkListener) {
    const key = record.interest.dynamic
      ? undefined
      : (record.interest.path ?? null)
    if (record.key === key) {
      return
    }
    indexLink(record, true)
    indexLink(record)
  }

  function notifyLink(record: LinkListener, currentVersion: number) {
    if (record.version >= currentVersion) {
      return
    }
    record.version = currentVersion
    const owner = router._tx
    if (
      record.interest.owner &&
      owner?.[2 /* location */] === linkSnapshot.location &&
      router.stores.status.get() === 'pending' &&
      !owner[3 /* matches */].some(
        (match) => match.routeId === record.interest.owner,
      )
    ) {
      // The owning route is leaving. Publishing its Link now forces a
      // synchronous external-store render during the route transition. If the
      // Link survives an aborted or superseded navigation, refresh it then.
      ;(deferred ??= new Set()).add(record)
      if (waiting !== owner) {
        waiting = owner
        owner[5 /* done */].then(
          () => settleDeferred(owner),
          () => settleDeferred(owner),
        )
      }
      return
    }
    deferred?.delete(record)
    record.listener(linkSnapshot)
    if (links?.has(record)) {
      reindexLink(record)
    }
  }

  function notifyPath(pathname: string, currentVersion: number) {
    let path = removeTrailingSlash(pathname, getBasepath())
    for (;;) {
      paths!.get(path)?.forEach((record) => notifyLink(record, currentVersion))
      const slash = path.lastIndexOf('/')
      // A root Link does not fuzzily match descendants under the segment rule.
      if (slash <= 0) {
        return
      }
      path = path.slice(0, slash)
    }
  }

  function notifyLinks(previous?: ParsedLocation, next = location.get()) {
    if (!links?.size) {
      return
    }
    linkSnapshot = { location: next }
    const nextHrefSource = getHrefSource()
    const formatChanged =
      !nextHrefSource ||
      !hrefSource ||
      nextHrefSource[0] !== hrefSource[0] ||
      nextHrefSource[1] !== hrefSource[1]
    hrefSource = nextHrefSource
    const currentVersion = ++version
    if (!previous) {
      links.forEach((record) => notifyLink(record, currentVersion))
    } else {
      if (previous !== next) {
        paths!
          .get(undefined)
          ?.forEach((record) => notifyLink(record, currentVersion))
      }
      if (
        previous.pathname !== next.pathname ||
        previous.search !== next.search ||
        previous.hash !== next.hash
      ) {
        notifyPath(previous.pathname, currentVersion)
        notifyPath(next.pathname, currentVersion)
      }
      if (formatChanged) {
        links.forEach((record) => notifyLink(record, currentVersion))
      }
    }
  }

  const setLocation = location.set
  function setLinkLocation(
    next:
      | ParsedLocation<FullSearchSchema<TRouteTree>>
      | ((
          previous: ParsedLocation<FullSearchSchema<TRouteTree>>,
        ) => ParsedLocation<FullSearchSchema<TRouteTree>>),
  ) {
    const previous = location.get()
    batch(() => {
      setLocation(next as ParsedLocation<FullSearchSchema<TRouteTree>>)
      notifyLinks(previous, location.get())
    })
  }
  return {
    getSnapshot: () => {
      const current = location.get()
      if (linkSnapshot.location !== current) {
        linkSnapshot = { location: current }
      }
      return linkSnapshot
    },
    subscribe: (
      interest: LinkLocationInterest,
      listener: (snapshot: { location: ParsedLocation }) => void,
    ) => {
      if (!links) {
        links = new Set()
        paths = new Map()
        hrefSource = getHrefSource()
      }
      if (!links.size) {
        location.set = setLinkLocation
      }
      const record: LinkListener = { interest, listener, version: 0 }
      links.add(record)
      indexLink(record)
      return {
        unsubscribe: () => {
          links?.delete(record)
          deferred?.delete(record)
          indexLink(record, true)
          if (!links?.size) {
            location.set = setLocation
          }
        },
        update: () => reindexLink(record),
      }
    },
    invalidate: () => batch(() => notifyLinks()),
  }
}
