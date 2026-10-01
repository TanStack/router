import { isServer } from '@tanstack/router-core/isServer'
import { removeTrailingSlash } from './path'
import { deepEqual, getUrlScheme, isDangerousProtocol } from './utils'
import type { ActiveOptions } from './link'
import type { ParsedLocation } from './location'
import type { AnyRouter, BuildNextOptions } from './router'
import type { LoadTransaction } from './load-client'

export type LinkStateOptions = BuildNextOptions & {
  disabled?: boolean
  activeOptions?: ActiveOptions
}

export type LinkState = readonly [href: string | undefined, isActive?: boolean]

/** Immutable inputs, a cached snapshot and one subscription lifetime. */
export type LinkStore = [
  router: AnyRouter,
  options: LinkStateOptions,
  owner: string | undefined,
  activeHash: false | string | undefined,
  evaluate: (<T>(read: () => T) => T) | undefined,
  value: LinkValue | undefined,
  // Only an unsubscribed descriptor remembers the location of its last read.
  source: ParsedLocation | undefined,
  listener: (() => void) | undefined,
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => LinkState,
]

export type LinkView = LinkStore

/** Actual build reads, kept separate from public location objects. */
export type LinkBuildTracking = [dependencies: number, location: ParsedLocation]

function directHref(router: AnyRouter, to: unknown) {
  if (typeof to !== 'string') {
    return undefined
  }
  const scheme = getUrlScheme(to)
  if (!scheme) {
    return undefined
  }
  if (!router.protocolAllowlist.has(scheme)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${to}`)
    }
    return null
  }
  return to
}

function isActive(
  router: AnyRouter,
  location: ParsedLocation,
  next: ParsedLocation,
  options: ActiveOptions | undefined,
  activeHash: false | string | undefined,
) {
  const currentPath = removeTrailingSlash(location.pathname, router.basepath)
  const nextPath = removeTrailingSlash(next.pathname, router.basepath)
  if (
    options?.exact
      ? currentPath !== nextPath
      : !(
          currentPath.startsWith(nextPath) &&
          (currentPath.length === nextPath.length ||
            currentPath[nextPath.length] === '/')
        )
  ) {
    return false
  }
  if (
    (options?.includeSearch ?? true) &&
    !deepEqual(
      location.search,
      next.search,
      !options?.exact,
      options?.explicitUndefined,
    )
  ) {
    return false
  }
  return (
    !options?.includeHash ||
    (activeHash !== false && (activeHash ?? location.hash) === next.hash)
  )
}

function stateFor(
  router: AnyRouter,
  options: LinkStateOptions,
  location: ParsedLocation,
  next: ParsedLocation | undefined,
  direct: string | null | undefined,
  activeHash: false | string | undefined,
): LinkState {
  if (direct !== undefined) {
    return [direct ?? undefined]
  }
  const target = next!.maskedLocation ?? next!
  let href = options.disabled
    ? undefined
    : target.external
      ? target.publicHref
      : router.history.createHref(target.publicHref) || '/'
  if (
    href &&
    (target.external || href !== target.publicHref) &&
    isDangerousProtocol(href, router.protocolAllowlist)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${href}`)
    }
    href = undefined
  }
  const internal = options.disabled || (href && !getUrlScheme(href))
  return [
    href,
    internal
      ? isActive(router, location, next!, options.activeOptions, activeHash)
      : undefined,
  ]
}

/** Static rendering uses the same derivation without creating subscriptions. */
export function readLinkState(
  router: AnyRouter,
  options: LinkStateOptions,
  activeHash?: false | string,
): LinkState {
  const direct = directHref(router, options.to)
  const next =
    direct === undefined ? router.buildLocation(options as any) : undefined
  return stateFor(
    router,
    options,
    router.stores.location.get(),
    next,
    direct,
    activeHash,
  )
}

type LinkValue = [
  // A missing result means derivation failed, even for `throw undefined`.
  result: LinkState | undefined,
  error: unknown,
  destination: ParsedLocation | undefined,
  dependencies: number,
  path: string | undefined,
  configuration: object,
]

/** Read errors in the renderer, never in navigation publication. */
export function readLinkSnapshot(store: LinkStore): LinkState {
  const value = refreshLink(store)
  if (!value[0 /* result */]) {
    throw value[1 /* error */]
  }
  return value[0 /* result */]
}

export function refreshLink(store: LinkStore): LinkValue {
  const router = store[0 /* router */]
  for (;;) {
    const location = router.stores.location.get()
    const configuration = router._linkOptions
    const owner = router._tx
    const previous = store[5 /* value */]
    if (
      previous &&
      previous[5 /* configuration */] === configuration &&
      (store[7 /* listener */] || store[6 /* source */] === location)
    ) {
      return previous
    }
    const value = prepareLink(store, location, true)
    if (
      router.stores.location.get() !== location ||
      router._linkOptions !== configuration ||
      router._tx !== owner ||
      store[5 /* value */] !== previous
    ) {
      continue
    }
    adoptLink(store, value)
    store[6 /* source */] = store[7 /* listener */] ? undefined : location
    return value
  }
}

function prepareLink(
  store: LinkStore,
  location: ParsedLocation,
  rebuild: boolean,
): LinkValue {
  const router = store[0 /* router */]
  const options = store[1 /* options */]
  const previous = store[5 /* value */]
  const configuration = router._linkOptions
  const reads: LinkBuildTracking = [
    rebuild ? 0 : previous![3 /* dependencies */],
    location,
  ]
  let destination = previous?.[2 /* destination */]
  let result: LinkState | undefined
  let error: unknown
  try {
    const direct = directHref(router, options.to)
    if (rebuild) {
      const build = () =>
        direct === undefined ? router._buildLocation(options, reads) : undefined
      destination = store[4 /* evaluate */]
        ? store[4 /* evaluate */](build)
        : build()
    }
    result = stateFor(
      router,
      options,
      location,
      destination,
      direct,
      store[3 /* activeHash */],
    )
  } catch (cause) {
    error = cause
    reads[0 /* dependencies */] |= previous?.[3 /* dependencies */] ?? 0
  }
  const previousResult = previous?.[0 /* result */]
  if (
    result &&
    previousResult &&
    result[0] === previousResult[0] &&
    result[1] === previousResult[1]
  ) {
    result = previousResult
  }
  const activeDependencies =
    1 |
    ((options.activeOptions?.includeSearch ?? true) ? 2 : 0) |
    (options.activeOptions?.includeHash ? 4 : 0)
  return [
    result,
    error,
    destination,
    reads[0 /* dependencies */],
    destination &&
    (reads[0 /* dependencies */] & activeDependencies) !== activeDependencies
      ? removeTrailingSlash(destination.pathname, router.basepath)
      : undefined,
    configuration,
  ]
}

function adoptLink(store: LinkStore, value: LinkValue) {
  const previous = store[5 /* value */]
  const registry = store[7 /* listener */]
    ? store[0 /* router */]._links
    : undefined
  const reindex =
    registry &&
    previous &&
    (previous[4 /* path */] !== value[4 /* path */] ||
      previous[3 /* dependencies */] !== value[3 /* dependencies */])
  if (reindex) {
    indexLink(registry, store, true)
  }
  store[5 /* value */] = value
  if (reindex) {
    indexLink(registry, store)
  }
  return (
    previous?.[0 /* result */] !== value[0 /* result */] ||
    previous?.[1 /* error */] !== value[1 /* error */] ||
    previous?.[2 /* destination */]?.href !== value[2 /* destination */]?.href
  )
}

/** Register only on subscription. Speculative descriptors own no live index. */
export function createLinkStore(
  router: AnyRouter,
  options: LinkStateOptions,
  owner?: string,
  activeHash?: false | string,
  evaluate?: <T>(read: () => T) => T,
): LinkStore {
  const store: LinkStore = [
    router,
    options,
    owner,
    activeHash,
    evaluate,
    undefined,
    undefined,
    undefined,
    (listener) => {
      if (isServer ?? router.isServer) {
        return () => {}
      }
      refreshLink(store)
      store[7 /* listener */] = listener
      const registry = (router._links ??= createLinkRegistry(router))
      addLink(registry, store)
      store[6 /* source */] = undefined
      return () => {
        if (store[7 /* listener */] === listener) {
          store[7 /* listener */] = undefined
          store[6 /* source */] = undefined
          removeLink(registry, store)
        }
      }
    },
    () => readLinkSnapshot(store),
  ]
  return store
}

/** Vue also observes the internal destination for preload cancellation. */
export function getLinkLocation(store: LinkStore) {
  readLinkSnapshot(store)
  return store[5 /* value */]![2 /* destination */]
}

export function invalidateLink(store: LinkStore) {
  const registry = store[0 /* router */]._links
  if (registry?.[1 /* records */].has(store)) {
    updateLinks(registry, [store])
  }
}

export type LinkRegistry = [
  router: AnyRouter,
  records: Set<LinkStore>,
  buckets: Map<string | number, Set<LinkStore>>,
  deferred: Set<LinkStore>,
  waiting: LoadTransaction | undefined,
  location: ParsedLocation,
  configuration: object,
  hrefSource: unknown,
]

function createLinkRegistry(router: AnyRouter): LinkRegistry {
  const registry: LinkRegistry = [
    router,
    new Set(),
    new Map(),
    new Set(),
    undefined,
    router.stores.location.get(),
    router._linkOptions,
    router.history._hrefSource?.[1 /* read */](),
  ]
  router.stores._onLocationChange = () => updateLinks(registry)
  return registry
}

function addLink(registry: LinkRegistry, store: LinkStore) {
  registry[1 /* records */].add(store)
  indexLink(registry, store)
}

function removeLink(registry: LinkRegistry, store: LinkStore) {
  registry[1 /* records */].delete(store)
  registry[3 /* deferred */].delete(store)
  indexLink(registry, store, true)
  if (!registry[1 /* records */].size) {
    registry[0 /* router */].stores._onLocationChange = undefined
    registry[0 /* router */]._links = undefined
  }
}

function indexLink(registry: LinkRegistry, store: LinkStore, remove = false) {
  const value = store[5 /* value */]!
  for (const key of [
    value[4 /* path */],
    value[3 /* dependencies */] || undefined,
  ]) {
    if (key === undefined) {
      continue
    }
    let group = registry[2 /* buckets */].get(key)
    if (remove) {
      group?.delete(store)
      if (!group?.size) {
        registry[2 /* buckets */].delete(key)
      }
    } else {
      if (!group) {
        registry[2 /* buckets */].set(key, (group = new Set()))
      }
      group.add(store)
    }
  }
}

function collectCandidates(
  registry: LinkRegistry,
  pathname: string,
  result: Set<LinkStore>,
) {
  let path = removeTrailingSlash(pathname, registry[0 /* router */].basepath)
  for (;;) {
    registry[2 /* buckets */].get(path)?.forEach((store) => result.add(store))
    const slash = path.lastIndexOf('/')
    if (slash <= 0) {
      return
    }
    path = path.slice(0, slash)
  }
}

function updateLinks(
  registry: LinkRegistry,
  selected?: Iterable<LinkStore>,
  settled?: LoadTransaction,
) {
  const router = registry[0 /* router */]
  const locationChange = !selected
  if (settled) {
    if (registry[4 /* waiting */] === settled) {
      registry[4 /* waiting */] = undefined
    }
    if (router._tx !== settled || router._links !== registry) {
      return
    }
  }
  const location = router.stores.location.get()
  const configuration = router._linkOptions
  const owner = router._tx
  let force = !!selected
  let changed = 0
  let hrefSource: unknown
  let pending: LoadTransaction | undefined
  let retained: Set<string> | undefined
  if (!selected) {
    const previous = registry[5 /* location */]
    force = configuration !== registry[6 /* configuration */]
    changed =
      (previous.pathname !== location.pathname ? 1 : 0) |
      (previous.search !== location.search ? 2 : 0) |
      (previous.hash !== location.hash ? 4 : 0) |
      (previous.state !== location.state ? 8 : 0)
    const formatting = router.history._hrefSource
    hrefSource = formatting?.[1 /* read */]()
    const formatChanged =
      !formatting ||
      formatting[0 /* createHref */] !== router.history.createHref ||
      hrefSource !== registry[7 /* hrefSource */]
    const candidates = new Set<LinkStore>()
    if (force) {
      registry[1 /* records */].forEach((store) => candidates.add(store))
    } else {
      if (changed & 7) {
        collectCandidates(registry, previous.pathname, candidates)
        collectCandidates(registry, location.pathname, candidates)
      }
      for (let mask = 1; mask < 16; mask++) {
        if (changed & mask) {
          registry[2 /* buckets */]
            .get(mask)
            ?.forEach((store) => candidates.add(store))
        }
      }
      if (formatChanged) {
        for (const store of registry[1 /* records */]) {
          if (store[5 /* value */]![2 /* destination */]) {
            candidates.add(store)
          }
        }
      }
    }
    pending =
      owner?.[2 /* location */] === location &&
      router.stores.status.get() === 'pending'
        ? owner
        : undefined
    retained = pending
      ? new Set(pending[3 /* matches */].map((match) => match.routeId))
      : undefined
    registry[3 /* deferred */].forEach((store) => {
      const routeId = store[2 /* owner */]
      if (!routeId || !retained || retained.has(routeId)) {
        candidates.add(store)
      }
    })
    selected = candidates
  }
  // Accepted values are the tokens for native invalidation and reentry.
  // There is no independent view adoption or generation to synchronize.
  const prepared: Array<[LinkStore, LinkValue, LinkValue]> = []
  const departing: Array<LinkStore> = []
  for (const store of selected) {
    if (!registry[1 /* records */].has(store)) {
      continue
    }
    const routeId = store[2 /* owner */]
    if (routeId && retained && !retained.has(routeId)) {
      departing.push(store)
    } else {
      const previous = store[5 /* value */]!
      const value = prepareLink(
        store,
        location,
        force ||
          registry[3 /* deferred */].has(store) ||
          !!(previous[3 /* dependencies */] & changed),
      )
      if (
        router.stores.location.get() !== location ||
        router._tx !== owner ||
        router._linkOptions !== configuration ||
        router._links !== registry
      ) {
        return
      }
      prepared.push([store, previous, value])
    }
  }
  const publish = () => {
    for (const store of departing) {
      if (registry[1 /* records */].has(store)) {
        registry[3 /* deferred */].add(store)
      }
    }
    const notifications: Array<LinkStore> = []
    for (const [store, previous, value] of prepared) {
      if (
        registry[1 /* records */].has(store) &&
        store[5 /* value */] === previous
      ) {
        registry[3 /* deferred */].delete(store)
        if (adoptLink(store, value)) {
          notifications.push(store)
        }
      }
    }
    if (locationChange) {
      registry[5 /* location */] = location
      registry[6 /* configuration */] = configuration
      registry[7 /* hrefSource */] = hrefSource
    }
    if (
      pending &&
      registry[3 /* deferred */].size &&
      registry[4 /* waiting */] !== pending
    ) {
      registry[4 /* waiting */] = pending
      const settle = updateLinks.bind(
        null,
        registry,
        registry[3 /* deferred */],
        pending,
      )
      pending[5 /* done */].then(settle, settle)
    }
    // Derivation can itself navigate. Finish it before notifying even when
    // observers only schedule a render rather than synchronously reading.
    for (const store of notifications) {
      if (registry[1 /* records */].has(store)) {
        store[7 /* listener */]?.()
      }
    }
  }
  if (settled) {
    router.batch(publish)
  } else {
    publish()
  }
}
