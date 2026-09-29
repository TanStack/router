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
  // Only speculative or unsubscribed views retain their source for catchup.
  source: ParsedLocation | undefined,
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
  // Missing result means derivation failed, even if the thrown value is undefined.
  // A blocked destination succeeds with [undefined].
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
    let value = view[5 /* value */]
    const ready =
      value &&
      value[7 /* configuration */] === configuration &&
      ((record[1 /* current */] === view && record[2 /* listener */]) ||
        view[6 /* source */] === location)
    if (ready && !adopt) {
      return value
    }
    if (!ready) {
      value = prepareLink(view, location, true)
    }
    // A render may catch up its own speculative view. A commit must also
    // retain the accepted owner it started with, or leave its successor alone.
    if (adopt && record[1 /* current */] !== previous) {
      return
    }
    if (
      router.stores.location.get() !== location ||
      router._linkOptions !== configuration
    ) {
      continue
    }
    if (
      adopt ||
      (record[1 /* current */] === view && record[2 /* listener */])
    ) {
      adoptLink(record, view, value!)
    } else {
      view[5 /* value */] = value
      view[6 /* source */] = location
    }
    if (adopt) {
      // A native adapter can subscribe before its first successful view.
      if (!previous && record[2 /* listener */]) {
        const registry = (router._links ??= createLinkRegistry(router))
        addLink(registry, record)
      }
      view[6 /* source */] = record[2 /* listener */] ? undefined : location
      router._links?.[4 /* deferred */].delete(record)
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
      // A full retarget also clears native callback dependencies when the
      // new destination is external. Active-only reads keep those intact.
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
    // Errors belong to the component reading this view, not to navigation.
    error = cause
    reads[0 /* dependencies */] |= previous?.[4 /* dependencies */] ?? 0
  }
  // Canonicalize before a render can observe this snapshot. Adoption must
  // preserve that exposed identity, including when another view was current.
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
    // These dependencies already select every active-relevant source change.
    destination &&
    (reads[0 /* dependencies */] & activeDependencies) !== activeDependencies
      ? removeTrailingSlash(destination.pathname, router.basepath)
      : undefined,
    configuration,
  ]
}

function adoptLink(record: LinkStore, view: LinkView, value: LinkValue) {
  const previous = record[1 /* current */]?.[5 /* value */]
  const changed =
    !previous ||
    previous[1 /* result */] !== value[1 /* result */] ||
    previous[2 /* error */] !== value[2 /* error */]
  const reindex =
    previous &&
    (previous[6 /* path */] !== value[6 /* path */] ||
      previous[4 /* dependencies */] !== value[4 /* dependencies */])
  const registry = record[2 /* listener */]
    ? record[0 /* router */]._links
    : undefined
  if (reindex && registry) {
    unindexLink(registry, record)
  }
  view[5 /* value */] = value
  record[1 /* current */] = view
  if (reindex && registry) {
    indexLink(registry, record)
  }
  return (
    changed ||
    previous?.[3 /* destination */]?.href !== value[3 /* destination */]?.href
  )
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
  const record = store
  readLinkSnapshot(record[1 /* current */]!)
  return record[1 /* current */]![5 /* value */]![3 /* destination */]
}

/** Native callback inputs use the same publication path as location inputs. */
export function invalidateLink(record: LinkStore) {
  const registry = record[0 /* router */]._links
  if (registry?.[1 /* records */].has(record)) {
    updateLinks(registry, [record])
  }
}
/** Indexes outputs and actual build reads rather than broadcasting location. */
export type LinkRegistry = [
  router: AnyRouter,
  records: Set<LinkStore>,
  paths: Map<string, Set<LinkStore>>,
  dependencies: Array<Set<LinkStore> | undefined>,
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
    [],
    new Set(),
    undefined,
    router.stores.location.get(),
    router._linkOptions,
    router.history._hrefSource?.read(),
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
  registry[4 /* deferred */].delete(record)
  unindexLink(registry, record)
  if (!registry[1 /* records */].size) {
    registry[0 /* router */].stores._onLocationChange = undefined
    registry[0 /* router */]._links = undefined
  }
}

function indexLink(registry: LinkRegistry, record: LinkStore) {
  const value = record[1 /* current */]![5 /* value */]!
  if (value[6 /* path */] !== undefined) {
    let path = registry[2 /* paths */].get(value[6 /* path */])
    if (!path) {
      registry[2 /* paths */].set(value[6 /* path */], (path = new Set()))
    }
    path.add(record)
  }
  const mask = value[4 /* dependencies */]
  if (mask) {
    const group = (registry[3 /* dependencies */][mask] ??= new Set())
    group.add(record)
  }
}

function unindexLink(registry: LinkRegistry, record: LinkStore) {
  const value = record[1 /* current */]![5 /* value */]!
  if (value[6 /* path */] !== undefined) {
    const path = registry[2 /* paths */].get(value[6 /* path */])
    path?.delete(record)
    if (!path?.size) {
      registry[2 /* paths */].delete(value[6 /* path */])
    }
  }
  registry[3 /* dependencies */][value[4 /* dependencies */]]?.delete(record)
}

function collectCandidates(
  registry: LinkRegistry,
  pathname: string,
  result: Set<LinkStore>,
) {
  let path = removeTrailingSlash(pathname, registry[0 /* router */].basepath)
  for (;;) {
    registry[2 /* paths */].get(path)?.forEach((record) => result.add(record))
    const slash = path.lastIndexOf('/')
    // '/' only matches itself or a double-slash prefix, not ordinary paths.
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
    if (registry[5 /* waiting */] === settled) {
      registry[5 /* waiting */] = undefined
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
    const previous = registry[6 /* location */]
    force = configuration !== registry[7 /* configuration */]
    changed =
      (previous.pathname !== location.pathname ? 1 : 0) |
      (previous.search !== location.search ? 2 : 0) |
      (previous.hash !== location.hash ? 4 : 0) |
      (previous.state !== location.state ? 8 : 0)
    const formatting = router.history._hrefSource
    hrefSource = formatting?.read()
    const formatChanged =
      !formatting ||
      formatting.createHref !== router.history.createHref ||
      hrefSource !== registry[8 /* hrefSource */]
    const candidates = new Set<LinkStore>()
    if (force) {
      registry[1 /* records */].forEach((record) => candidates.add(record))
    } else {
      if (changed & 7) {
        collectCandidates(registry, previous.pathname, candidates)
        collectCandidates(registry, location.pathname, candidates)
      }
      for (let mask = 1; mask < registry[3 /* dependencies */].length; mask++) {
        if (changed & mask) {
          registry[3 /* dependencies */][mask]?.forEach((record) =>
            candidates.add(record),
          )
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
    registry[4 /* deferred */].forEach((record) => {
      const ownerRouteId = record[1 /* current */]![2 /* owner */]
      if (!ownerRouteId || !retained || retained.has(ownerRouteId)) {
        candidates.add(record)
      }
    })
    selected = candidates
  }
  const prepared: Array<[LinkValue, LinkValue]> = []
  const departing: Array<LinkStore> = []
  for (const record of selected) {
    if (!registry[1 /* records */].has(record)) {
      continue
    }
    const ownerRouteId = record[1 /* current */]![2 /* owner */]
    if (ownerRouteId && retained && !retained.has(ownerRouteId)) {
      departing.push(record)
      continue
    }
    const previousValue = record[1 /* current */]![5 /* value */]!
    const value = prepareLink(
      record[1 /* current */]!,
      location,
      force ||
        registry[4 /* deferred */].has(record) ||
        !!(previousValue[4 /* dependencies */] & changed),
    )
    // Every cause stages against the same source and accepted value. A
    // reentrant build must leave its successor's complete publication alone.
    if (router.stores.location.get() !== location || router._tx !== owner) {
      return
    }
    prepared.push([previousValue, value])
  }
  const publish = () => {
    for (const record of departing) {
      if (registry[1 /* records */].has(record)) {
        registry[4 /* deferred */].add(record)
      }
    }
    const notifications: Array<LinkStore> = []
    for (const [previousValue, value] of prepared) {
      const record = value[0 /* view */][0 /* record */]
      // Native inputs can replace a sibling's value without replacing its
      // view or location. Only publish the exact value that was prepared.
      if (
        registry[1 /* records */].has(record) &&
        record[1 /* current */] === value[0 /* view */] &&
        record[1 /* current */][5 /* value */] === previousValue
      ) {
        registry[4 /* deferred */].delete(record)
        if (adoptLink(record, value[0 /* view */], value)) {
          notifications.push(record)
        }
      }
    }
    if (locationChange) {
      registry[6 /* location */] = location
      registry[7 /* configuration */] = configuration
      registry[8 /* hrefSource */] = hrefSource
    }
    if (
      pending &&
      registry[4 /* deferred */].size &&
      registry[5 /* waiting */] !== pending
    ) {
      registry[5 /* waiting */] = pending
      // Bind only settlement inputs; a closure here retains prepared views.
      const settle = updateLinks.bind(
        null,
        registry,
        registry[4 /* deferred */],
        pending,
      )
      pending[5 /* done */].then(settle, settle)
    }
    // The complete accepted snapshot is visible before listeners can reenter.
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
