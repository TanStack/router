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

export type LinkView = [
  record: LinkStore,
  options: LinkStateOptions,
  owner: string | undefined,
  activeHash: false | string | undefined,
  evaluate: (<T>(read: () => T) => T) | undefined,
  value: LinkValue | undefined,
  // Unsubscribed views remember their source. Subscribed views retain no
  // historical location: undefined is clean, 1 is active-only, 2 is a rebuild.
  source: ParsedLocation | number | undefined,
  getSnapshot: (() => LinkState) | undefined,
]

export type LinkStore = [
  router: AnyRouter,
  current: LinkView | undefined,
  listener: (() => void) | undefined,
  subscribe: (listener: () => void) => () => void,
]

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
  view: LinkView,
  // A missing result means derivation failed, even for `throw undefined`.
  result: LinkState | undefined,
  error: unknown,
  destination: ParsedLocation | undefined,
  dependencies: number,
  direct: string | null | undefined,
  path: string | undefined,
  configuration: object,
]

export function readLinkSnapshot(view: LinkView): LinkState {
  const value = refreshLink(view, false)!
  if (!value[1 /* result */]) {
    throw value[2 /* error */]
  }
  return value[1 /* result */]
}

export function refreshLink(view: LinkView, adopt: boolean) {
  const record = view[0 /* record */]
  const router = record[0 /* router */]
  const previous = record[1 /* current */]
  for (;;) {
    const location = router.stores.location.get()
    const configuration = router._linkOptions
    const owner = router._tx
    const mounted = record[1 /* current */] === view && record[2 /* listener */]
    const previousValue = view[5 /* value */]
    let value = previousValue
    const ready =
      value &&
      value[7 /* configuration */] === configuration &&
      (mounted
        ? view[6 /* source */] === undefined
        : view[6 /* source */] === location)
    if (ready && !adopt) {
      return value
    }
    if (!ready) {
      value = prepareLink(
        view,
        location,
        !mounted ||
          value?.[7 /* configuration */] !== configuration ||
          view[6 /* source */] !== 1,
      )
    }
    // A speculative read cannot take ownership from an accepted successor.
    if (adopt && record[1 /* current */] !== previous) {
      return
    }
    if (
      router.stores.location.get() !== location ||
      router._linkOptions !== configuration ||
      router._tx !== owner ||
      view[5 /* value */] !== previousValue
    ) {
      continue
    }
    if (
      adopt ||
      (record[1 /* current */] === view && record[2 /* listener */])
    ) {
      adoptLink(record, view, value!)
      view[6 /* source */] = record[2 /* listener */] ? undefined : location
    } else {
      view[5 /* value */] = value
      view[6 /* source */] = location
    }
    if (adopt) {
      // Native adapters can subscribe before their first successful view.
      if (!previous && record[2 /* listener */]) {
        const registry = (router._links ??= createLinkRegistry(router))
        addLink(registry, record)
      }
      router._links?.[3 /* deferred */].delete(record)
    }
    return value
  }
}

function prepareLink(
  view: LinkView,
  location: ParsedLocation,
  rebuild: boolean,
): LinkValue {
  const router = view[0 /* record */][0 /* router */]
  const previous = view[5 /* value */]
  const configuration = router._linkOptions
  let direct = previous?.[5 /* direct */]
  let destination = previous?.[3 /* destination */]
  const reads: LinkBuildTracking = [
    rebuild ? 0 : previous![4 /* dependencies */],
    location,
  ]
  let result: LinkState | undefined
  let error: unknown
  try {
    if (rebuild) {
      direct = directHref(router, view[1 /* options */].to)
      destination = view[4 /* evaluate */]
        ? view[4 /* evaluate */](() =>
            direct === undefined
              ? router._buildLocation(view[1 /* options */], reads)
              : undefined,
          )
        : direct === undefined
          ? router._buildLocation(view[1 /* options */], reads)
          : undefined
    }
    result = stateFor(
      router,
      view[1 /* options */],
      location,
      destination,
      direct,
      view[3 /* activeHash */],
    )
  } catch (cause) {
    error = cause
    reads[0 /* dependencies */] |= previous?.[4 /* dependencies */] ?? 0
  }
  const previousResult = (previous ??
    view[0 /* record */][1 /* current */]?.[5 /* value */])?.[1 /* result */]
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
    ((view[1 /* options */].activeOptions?.includeSearch ?? true) ? 2 : 0) |
    (view[1 /* options */].activeOptions?.includeHash ? 4 : 0)
  return [
    view,
    result,
    error,
    destination,
    reads[0 /* dependencies */],
    direct,
    destination &&
    (reads[0 /* dependencies */] & activeDependencies) !== activeDependencies
      ? removeTrailingSlash(destination.pathname, router.basepath)
      : undefined,
    configuration,
  ]
}

function adoptLink(record: LinkStore, view: LinkView, value: LinkValue) {
  const previous = record[1 /* current */]?.[5 /* value */]
  const reindex =
    previous &&
    (previous[6 /* path */] !== value[6 /* path */] ||
      previous[4 /* dependencies */] !== value[4 /* dependencies */])
  const registry = record[2 /* listener */]
    ? record[0 /* router */]._links
    : undefined
  if (reindex && registry) {
    indexLink(registry, record, true)
  }
  view[5 /* value */] = value
  record[1 /* current */] = view
  if (reindex && registry) {
    indexLink(registry, record)
  }
}

/** One subscription and index identity for the component's committed lifetime. */
export function createLinkStore(router: AnyRouter): LinkStore {
  const record: LinkStore = [
    router,
    undefined,
    undefined,
    (listener) => {
      if (isServer ?? record[0 /* router */].isServer) {
        return () => {}
      }
      if (!record[2 /* listener */] && record[1 /* current */]) {
        refreshLink(record[1 /* current */], true)
        record[2 /* listener */] = listener
        const registry = (record[0 /* router */]._links ??= createLinkRegistry(
          record[0 /* router */],
        ))
        addLink(registry, record)
        record[1 /* current */][6 /* source */] = undefined
      } else {
        record[2 /* listener */] = listener
      }
      return () => {
        if (record[2 /* listener */] === listener) {
          record[2 /* listener */] = undefined
          if (record[1 /* current */]) {
            record[1 /* current */][6 /* source */] = undefined
            const registry = record[0 /* router */]._links
            if (registry) {
              removeLink(registry, record)
            }
          }
        }
      }
    },
  ]
  return record
}

/** Vue reads the destination in addition to the published href and active state. */
export function getLinkLocation(store: LinkStore) {
  readLinkSnapshot(store[1 /* current */]!)
  return store[1 /* current */]![5 /* value */]![3 /* destination */]
}

/** Native callback inputs use the same invalidation path as location inputs. */
export function invalidateLink(record: LinkStore) {
  const registry = record[0 /* router */]._links
  if (registry?.[1 /* records */].has(record)) {
    updateLinks(registry, [record])
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

function addLink(registry: LinkRegistry, record: LinkStore) {
  registry[1 /* records */].add(record)
  indexLink(registry, record)
}

function removeLink(registry: LinkRegistry, record: LinkStore) {
  registry[1 /* records */].delete(record)
  registry[3 /* deferred */].delete(record)
  indexLink(registry, record, true)
  if (!registry[1 /* records */].size) {
    registry[0 /* router */].stores._onLocationChange = undefined
    registry[0 /* router */]._links = undefined
  }
}

function indexLink(registry: LinkRegistry, record: LinkStore, remove = false) {
  const value = record[1 /* current */]![5 /* value */]!
  for (const key of [
    value[6 /* path */],
    value[4 /* dependencies */] || undefined,
  ]) {
    if (key === undefined) {
      continue
    }
    let group = registry[2 /* buckets */].get(key)
    if (remove) {
      group?.delete(record)
      if (!group?.size) {
        registry[2 /* buckets */].delete(key)
      }
    } else {
      if (!group) {
        registry[2 /* buckets */].set(key, (group = new Set()))
      }
      group.add(record)
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
    registry[2 /* buckets */].get(path)?.forEach((record) => result.add(record))
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
      registry[1 /* records */].forEach((record) => candidates.add(record))
    } else {
      if (changed & 7) {
        collectCandidates(registry, previous.pathname, candidates)
        collectCandidates(registry, location.pathname, candidates)
      }
      for (let mask = 1; mask < 16; mask++) {
        if (changed & mask) {
          registry[2 /* buckets */]
            .get(mask)
            ?.forEach((record) => candidates.add(record))
        }
      }
      if (formatChanged) {
        for (const record of registry[1 /* records */]) {
          if (record[1 /* current */]![5 /* value */]![3 /* destination */]) {
            candidates.add(record)
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
    registry[3 /* deferred */].forEach((record) => {
      const ownerRouteId = record[1 /* current */]![2 /* owner */]
      if (!ownerRouteId || !retained || retained.has(ownerRouteId)) {
        candidates.add(record)
      }
    })
    selected = candidates
  }
  const publish = () => {
    const notifications: Array<LinkStore> = []
    for (const record of selected!) {
      if (!registry[1 /* records */].has(record)) {
        continue
      }
      const view = record[1 /* current */]!
      const ownerRouteId = view[2 /* owner */]
      if (ownerRouteId && retained && !retained.has(ownerRouteId)) {
        registry[3 /* deferred */].add(record)
      } else {
        const rebuild =
          force ||
          registry[3 /* deferred */].has(record) ||
          !!(view[5 /* value */]![4 /* dependencies */] & changed)
        registry[3 /* deferred */].delete(record)
        // Invalidation is monotonic until read: a later active-only update
        // cannot discard an earlier destination invalidation.
        view[6 /* source */] =
          view[6 /* source */] === 2 || rebuild ? 2 : 1
        notifications.push(record)
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
    // Invalidate every selected snapshot before invoking any user code.
    // Reads then derive against the authoritative location and can restart
    // after reentry; no prepared outputs survive a successor publication.
    for (const record of notifications) {
      if (registry[1 /* records */].has(record)) {
        record[2 /* listener */]?.()
      }
    }
  }
  if (settled) {
    router.batch(publish)
  } else {
    publish()
  }
}
