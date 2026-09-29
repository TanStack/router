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

export interface LinkView {
  record: LinkStore
  options: LinkStateOptions
  owner: string | undefined
  activeHash: false | string | undefined
  evaluate: (<T>(read: () => T) => T) | undefined
  value: LinkValue | undefined
  // Only speculative or unsubscribed views retain their source for catchup.
  source: ParsedLocation | undefined
  getSnapshot: () => LinkState
}

export interface LinkStore {
  router: AnyRouter
  current: LinkView | undefined
  listener: (() => void) | undefined
  subscribe: (listener: () => void) => () => void
}

/** Actual build reads, kept separate from public location objects. */
export interface LinkBuildTracking {
  dependencies: number
  location: ParsedLocation
}

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

type LinkValue = {
  view: LinkView
  // Missing result means derivation failed, even if the thrown value is undefined.
  // A blocked destination succeeds with [undefined].
  result: LinkState | undefined
  error: unknown
  destination: ParsedLocation | undefined
  dependencies: number
  direct: string | null | undefined
  path: string | undefined
  configuration: object
}

/** Immutable render inputs remain unregistered until their component commits. */
export function renderLinkView(
  record: LinkStore,
  options: LinkStateOptions,
  owner?: string,
  activeHash?: false | string,
  evaluate?: <T>(read: () => T) => T,
): LinkView {
  const view: LinkView = {
    record,
    options,
    owner,
    activeHash,
    evaluate,
    value: undefined,
    source: undefined,
    getSnapshot: () => readLinkSnapshot(view),
  }
  return view
}

export function readLinkSnapshot(view: LinkView): LinkState {
  const value = refreshLink(view, false)!
  if (!value.result) {
    throw value.error
  }
  return value.result
}

export function commitLinkView(view: LinkView) {
  refreshLink(view, true)
}

function refreshLink(view: LinkView, adopt: boolean) {
  const record = view.record
  const router = record.router
  const previous = record.current
  for (;;) {
    const location = router.stores.location.get()
    const configuration = router._linkOptions
    let value = view.value
    const ready =
      value &&
      value.configuration === configuration &&
      ((record.current === view && record.listener) || view.source === location)
    if (ready && !adopt) {
      return value
    }
    if (!ready) {
      value = prepareLink(view, location, true)
    }
    // A render may catch up its own speculative view. A commit must also
    // retain the accepted owner it started with, or leave its successor alone.
    if (adopt && record.current !== previous) {
      return
    }
    if (
      router.stores.location.get() !== location ||
      router._linkOptions !== configuration
    ) {
      continue
    }
    if (adopt || (record.current === view && record.listener)) {
      adoptLink(record, view, value!)
    } else {
      view.value = value
      view.source = location
    }
    if (adopt) {
      // A native adapter can subscribe before its first successful view.
      if (!previous && record.listener) {
        const registry = (router._links ??= createLinkRegistry(router))
        addLink(registry, record)
      }
      view.source = record.listener ? undefined : location
      router._links?.deferred.delete(record)
    }
    return value
  }
}

function prepareLink(
  view: LinkView,
  location: ParsedLocation,
  rebuild: boolean,
): LinkValue {
  const router = view.record.router
  const previous = view.value
  const configuration = router._linkOptions
  let direct = previous?.direct
  let destination = previous?.destination
  const reads: LinkBuildTracking = {
    dependencies: rebuild ? 0 : previous!.dependencies,
    location,
  }
  let result: LinkState | undefined
  let error: unknown
  try {
    if (rebuild) {
      direct = directHref(router, view.options.to)
      // A full retarget also clears native callback dependencies when the
      // new destination is external. Active-only reads keep those intact.
      destination = view.evaluate
        ? view.evaluate(() =>
            direct === undefined
              ? router._buildLocation(view.options, reads)
              : undefined,
          )
        : direct === undefined
          ? router._buildLocation(view.options, reads)
          : undefined
    }
    result = stateFor(
      router,
      view.options,
      location,
      destination,
      direct,
      view.activeHash,
    )
  } catch (cause) {
    // Errors belong to the component reading this view, not to navigation.
    error = cause
    reads.dependencies |= previous?.dependencies ?? 0
  }
  // Canonicalize before a render can observe this snapshot. Adoption must
  // preserve that exposed identity, including when another view was current.
  const previousResult = (previous ?? view.record.current?.value)?.result
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
    ((view.options.activeOptions?.includeSearch ?? true) ? 2 : 0) |
    (view.options.activeOptions?.includeHash ? 4 : 0)
  return {
    view,
    result,
    error,
    destination,
    dependencies: reads.dependencies,
    direct,
    // These dependencies already select every active-relevant source change.
    path:
      destination &&
      (reads.dependencies & activeDependencies) !== activeDependencies
        ? removeTrailingSlash(destination.pathname, router.basepath)
        : undefined,
    configuration,
  }
}

function adoptLink(record: LinkStore, view: LinkView, value: LinkValue) {
  const previous = record.current?.value
  const changed =
    !previous ||
    previous.result !== value.result ||
    previous.error !== value.error
  const reindex =
    previous &&
    (previous.path !== value.path ||
      previous.dependencies !== value.dependencies)
  const registry = record.listener ? record.router._links : undefined
  if (reindex && registry) {
    unindexLink(registry, record)
  }
  view.value = value
  record.current = view
  if (reindex && registry) {
    indexLink(registry, record)
  }
  return changed || previous?.destination?.href !== value.destination?.href
}

/** One subscription and index identity for the component's committed lifetime. */
export function createLinkStore(router: AnyRouter): LinkStore {
  const record: LinkStore = {
    router,
    current: undefined,
    listener: undefined,
    subscribe: (listener) => {
      if (isServer ?? record.router.isServer) {
        return () => {}
      }
      if (!record.listener && record.current) {
        commitLinkView(record.current)
        record.listener = listener
        const registry = (record.router._links ??= createLinkRegistry(
          record.router,
        ))
        addLink(registry, record)
        record.current.source = undefined
      } else {
        record.listener = listener
      }
      return () => {
        if (record.listener === listener) {
          record.listener = undefined
          if (record.current) {
            record.current.source = undefined
            const registry = record.router._links
            if (registry) {
              removeLink(registry, record)
            }
          }
        }
      }
    },
  }
  return record
}

/** Vue reads the destination in addition to the published href and active state. */
export function getLinkLocation(store: LinkStore) {
  const record = store
  readLinkSnapshot(record.current!)
  return record.current!.value!.destination
}

/** Native callback inputs use the same publication path as location inputs. */
export function invalidateLink(record: LinkStore) {
  const registry = record.router._links
  if (registry?.records.has(record)) {
    updateLinks(registry, [record])
  }
}
/** Indexes outputs and actual build reads rather than broadcasting location. */
export interface LinkRegistry {
  router: AnyRouter
  records: Set<LinkStore>
  paths: Map<string, Set<LinkStore>>
  dependencies: Array<Set<LinkStore> | undefined>
  deferred: Set<LinkStore>
  waiting: LoadTransaction | undefined
  location: ParsedLocation
  configuration: object
  hrefSource: unknown
}

function createLinkRegistry(router: AnyRouter): LinkRegistry {
  const registry: LinkRegistry = {
    router,
    records: new Set(),
    paths: new Map(),
    dependencies: [],
    deferred: new Set(),
    waiting: undefined,
    location: router.stores.location.get(),
    configuration: router._linkOptions,
    hrefSource: router.history._hrefSource?.read(),
  }
  router.stores._onLocationChange = () => updateLinks(registry)
  return registry
}

function addLink(registry: LinkRegistry, record: LinkStore) {
  registry.records.add(record)
  indexLink(registry, record)
}

function removeLink(registry: LinkRegistry, record: LinkStore) {
  registry.records.delete(record)
  registry.deferred.delete(record)
  unindexLink(registry, record)
  if (!registry.records.size) {
    registry.router.stores._onLocationChange = undefined
    registry.router._links = undefined
  }
}

function indexLink(registry: LinkRegistry, record: LinkStore) {
  const value = record.current!.value!
  if (value.path !== undefined) {
    let path = registry.paths.get(value.path)
    if (!path) {
      registry.paths.set(value.path, (path = new Set()))
    }
    path.add(record)
  }
  const mask = value.dependencies
  if (mask) {
    const group = (registry.dependencies[mask] ??= new Set())
    group.add(record)
  }
}

function unindexLink(registry: LinkRegistry, record: LinkStore) {
  const value = record.current!.value!
  if (value.path !== undefined) {
    const path = registry.paths.get(value.path)
    path?.delete(record)
    if (!path?.size) {
      registry.paths.delete(value.path)
    }
  }
  registry.dependencies[value.dependencies]?.delete(record)
}

function collectCandidates(
  registry: LinkRegistry,
  pathname: string,
  result: Set<LinkStore>,
) {
  let path = removeTrailingSlash(pathname, registry.router.basepath)
  for (;;) {
    registry.paths.get(path)?.forEach((record) => result.add(record))
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
  const router = registry.router
  const locationChange = !selected
  if (settled) {
    if (registry.waiting === settled) {
      registry.waiting = undefined
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
    const previous = registry.location
    force = configuration !== registry.configuration
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
      hrefSource !== registry.hrefSource
    const candidates = new Set<LinkStore>()
    if (force) {
      registry.records.forEach((record) => candidates.add(record))
    } else {
      if (changed & 7) {
        collectCandidates(registry, previous.pathname, candidates)
        collectCandidates(registry, location.pathname, candidates)
      }
      for (let mask = 1; mask < registry.dependencies.length; mask++) {
        if (changed & mask) {
          registry.dependencies[mask]?.forEach((record) =>
            candidates.add(record),
          )
        }
      }
      if (formatChanged) {
        for (const record of registry.records) {
          if (record.current!.value!.destination) {
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
    registry.deferred.forEach((record) => {
      const ownerRouteId = record.current!.owner
      if (!ownerRouteId || !retained || retained.has(ownerRouteId)) {
        candidates.add(record)
      }
    })
    selected = candidates
  }
  const prepared: Array<[LinkValue, LinkValue]> = []
  const departing: Array<LinkStore> = []
  for (const record of selected) {
    if (!registry.records.has(record)) {
      continue
    }
    const ownerRouteId = record.current!.owner
    if (ownerRouteId && retained && !retained.has(ownerRouteId)) {
      departing.push(record)
      continue
    }
    const previousValue = record.current!.value!
    const value = prepareLink(
      record.current!,
      location,
      force ||
        registry.deferred.has(record) ||
        !!(previousValue.dependencies & changed),
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
      if (registry.records.has(record)) {
        registry.deferred.add(record)
      }
    }
    const notifications: Array<LinkStore> = []
    for (const [previousValue, value] of prepared) {
      const record = value.view.record
      // Native inputs can replace a sibling's value without replacing its
      // view or location. Only publish the exact value that was prepared.
      if (
        registry.records.has(record) &&
        record.current === value.view &&
        record.current.value === previousValue
      ) {
        registry.deferred.delete(record)
        if (adoptLink(record, value.view, value)) {
          notifications.push(record)
        }
      }
    }
    if (locationChange) {
      registry.location = location
      registry.configuration = configuration
      registry.hrefSource = hrefSource
    }
    if (pending && registry.deferred.size && registry.waiting !== pending) {
      registry.waiting = pending
      // Bind only settlement inputs; a closure here retains prepared views.
      const settle = updateLinks.bind(
        null,
        registry,
        registry.deferred,
        pending,
      )
      pending[5 /* done */].then(settle, settle)
    }
    // The complete accepted snapshot is visible before listeners can reenter.
    for (const record of notifications) {
      if (registry.records.has(record)) {
        record.listener?.()
      }
    }
  }
  if (settled) {
    router.batch(publish)
  } else {
    publish()
  }
}
